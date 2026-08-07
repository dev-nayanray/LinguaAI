import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Course, Level, PrismaClient, Unit } from '@linguaai/database';
import type {
  CourseResponse,
  CreateCourseRequest,
  CreateLevelRequest,
  CreateUnitRequest,
  LevelResponse,
  UnitResponse,
  UpdateCourseRequest,
  UpdateLevelRequest,
  UpdateUnitRequest,
} from '@linguaai/validation/content';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { ContentVersioningService } from './content-versioning.service.js';

function toWireCourse(course: Course): CourseResponse {
  return {
    id: course.id,
    languageId: course.languageId,
    title: course.title,
    description: course.description,
    slug: course.slug,
    publishedAt: course.publishedAt ? course.publishedAt.toISOString() : null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

function toWireLevel(level: Level): LevelResponse {
  return {
    id: level.id,
    courseId: level.courseId,
    cefrLevel: level.cefrLevel,
    title: level.title,
    description: level.description,
    order: level.order,
    createdAt: level.createdAt.toISOString(),
    updatedAt: level.updatedAt.toISOString(),
  };
}

function toWireUnit(unit: Unit): UnitResponse {
  return {
    id: unit.id,
    levelId: unit.levelId,
    title: unit.title,
    description: unit.description,
    order: unit.order,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

/**
 * `Course`/`Level`/`Unit` CRUD + publish (E8 T1, §6.1) — the structural
 * hierarchy above `LessonContentService`'s own leaf entities. No
 * `ContentVersion` snapshotting here (§6.1's own found schema constraint:
 * `ContentEntityType` excludes `Course`/`Level`/`Unit` entirely) — publish
 * itself is what triggers the real, leaf-scoped backfill
 * (`ContentVersioningService.backfillVersionsForCourse`).
 *
 * `content.prisma` carries no RLS policy (its own header comment,
 * confirmed by direct inspection) — `APP_PRISMA_CLIENT` throughout, the
 * same ordinary `app_role` connection `AssessmentService`/`RecommendationsService`
 * already use for their own unpoliced tables.
 */
@Injectable()
export class CourseHierarchyService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly versioning: ContentVersioningService,
  ) {}

  // --- Course ---

  async createCourse(dto: CreateCourseRequest): Promise<CourseResponse> {
    const course = await this.appPrisma.course.create({
      data: {
        languageId: dto.languageId,
        title: dto.title,
        description: dto.description,
        slug: dto.slug,
      },
    });
    return toWireCourse(course);
  }

  async updateCourse(id: string, dto: UpdateCourseRequest): Promise<CourseResponse> {
    await this.getOwnedCourse(id);
    const course = await this.appPrisma.course.update({ where: { id }, data: dto });
    return toWireCourse(course);
  }

  /**
   * Idempotent on `publishedAt` itself (a re-publish of an already-live
   * course doesn't reset its original publish timestamp) — but always
   * re-runs the backfill, since content authored *after* the first
   * publish and never individually edited (so `LessonContentService`
   * never called `snapshotIfPublished` for it) would otherwise carry no
   * version history at all; `ensureVersionExists`'s own idempotency
   * means already-versioned entities are untouched by a repeat call.
   */
  async publishCourse(id: string): Promise<CourseResponse> {
    const existing = await this.getOwnedCourse(id);
    const course = await this.appPrisma.$transaction(async (tx) => {
      const result = existing.publishedAt
        ? existing
        : await tx.course.update({ where: { id }, data: { publishedAt: new Date() } });
      await this.versioning.backfillVersionsForCourse(id, tx);
      return result;
    });
    return toWireCourse(course);
  }

  async deleteCourse(id: string): Promise<void> {
    await this.getOwnedCourse(id);
    await this.appPrisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Level ---

  async createLevel(courseId: string, dto: CreateLevelRequest): Promise<LevelResponse> {
    await this.getOwnedCourse(courseId);
    const level = await this.appPrisma.level.create({
      data: {
        courseId,
        cefrLevel: dto.cefrLevel,
        title: dto.title,
        description: dto.description,
        order: dto.order,
      },
    });
    return toWireLevel(level);
  }

  async updateLevel(id: string, dto: UpdateLevelRequest): Promise<LevelResponse> {
    await this.getOwnedLevel(id);
    const level = await this.appPrisma.level.update({ where: { id }, data: dto });
    return toWireLevel(level);
  }

  async deleteLevel(id: string): Promise<void> {
    await this.getOwnedLevel(id);
    await this.appPrisma.level.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Unit ---

  async createUnit(levelId: string, dto: CreateUnitRequest): Promise<UnitResponse> {
    await this.getOwnedLevel(levelId);
    const unit = await this.appPrisma.unit.create({
      data: { levelId, title: dto.title, description: dto.description, order: dto.order },
    });
    return toWireUnit(unit);
  }

  async updateUnit(id: string, dto: UpdateUnitRequest): Promise<UnitResponse> {
    await this.getOwnedUnit(id);
    const unit = await this.appPrisma.unit.update({ where: { id }, data: dto });
    return toWireUnit(unit);
  }

  async deleteUnit(id: string): Promise<void> {
    await this.getOwnedUnit(id);
    await this.appPrisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Ownership/existence checks (404, matching AssessmentService.getOwnedAttempt's own precedent) ---

  private async getOwnedCourse(id: string): Promise<Course> {
    const course = await this.appPrisma.course.findUnique({ where: { id } });
    if (!course || course.deletedAt) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private async getOwnedLevel(id: string): Promise<Level> {
    const level = await this.appPrisma.level.findUnique({ where: { id } });
    if (!level || level.deletedAt) {
      throw new NotFoundException('Level not found');
    }
    return level;
  }

  private async getOwnedUnit(id: string): Promise<Unit> {
    const unit = await this.appPrisma.unit.findUnique({ where: { id } });
    if (!unit || unit.deletedAt) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }
}
