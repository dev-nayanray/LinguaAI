import { Inject, Injectable } from '@nestjs/common';
import type { ContentEntityType, Prisma, PrismaClient } from '@linguaai/database';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Shared `ContentVersion` snapshotting (E8 T1, §6.1) — used by both
 * `CourseHierarchyService` (publish-time backfill) and
 * `LessonContentService` (edit-while-published). `ContentVersion` is
 * scoped to leaf entities only (`LESSON | ACTIVITY | EXERCISE | QUIZ`,
 * content.prisma's own `ContentEntityType`) — `Course`/`Level`/`Unit`
 * never get one, since a learner only ever attempts an `Exercise`, never
 * a `Course`/`Level`/`Unit` directly (design doc §6.1).
 *
 * Versioning trigger (a real design decision made in the design doc, not
 * left silently ambiguous): a new snapshot is created the moment a leaf
 * entity's owning `Course` is first published (`ensureVersionExists` —
 * idempotent, version 1 only, called once per entity by
 * `backfillVersionsForCourse`), and on every subsequent edit to that
 * entity while its course remains published (`createNextVersion`, called
 * by `LessonContentService` after every update).
 */
@Injectable()
export class ContentVersioningService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async isCoursePublished(courseId: string, tx?: Client): Promise<boolean> {
    const client = tx ?? this.appPrisma;
    const course = await client.course.findUnique({
      where: { id: courseId },
      select: { publishedAt: true },
    });
    return course?.publishedAt != null;
  }

  async getCourseIdForLesson(lessonId: string, tx?: Client): Promise<string | null> {
    const client = tx ?? this.appPrisma;
    const lesson = await client.lesson.findUnique({
      where: { id: lessonId },
      select: { unit: { select: { level: { select: { courseId: true } } } } },
    });
    return lesson?.unit.level.courseId ?? null;
  }

  async getCourseIdForActivity(activityId: string, tx?: Client): Promise<string | null> {
    const client = tx ?? this.appPrisma;
    const activity = await client.activity.findUnique({
      where: { id: activityId },
      select: {
        lesson: { select: { unit: { select: { level: { select: { courseId: true } } } } } },
      },
    });
    return activity?.lesson.unit.level.courseId ?? null;
  }

  /**
   * `ExerciseAttemptsService` (E8 T2, §6.2) calls this to pin a new
   * attempt to the exercise's own current version at attempt time —
   * `ExerciseAttempt.contentVersionId`'s own stated purpose (DATABASE.md
   * §2.3). `null` only for the edge case of an exercise whose course was
   * never actually published through this mechanism (should not occur
   * for any content this epic's own authoring flow creates, since publish
   * is what creates version 1 — §6.1).
   */
  async getCurrentVersionId(
    entityType: ContentEntityType,
    entityId: string,
    tx?: Client,
  ): Promise<string | null> {
    const client = tx ?? this.appPrisma;
    const latest = await client.contentVersion.findFirst({
      where: { entityType, entityId },
      orderBy: { versionNumber: 'desc' },
      select: { id: true },
    });
    return latest?.id ?? null;
  }

  /** Only creates a new version when the owning course is already live — a draft-content edit never accumulates version history it will never need. */
  async snapshotIfPublished(
    entityType: ContentEntityType,
    entityId: string,
    courseId: string,
    snapshot: Prisma.InputJsonObject,
    tx?: Client,
  ): Promise<void> {
    const published = await this.isCoursePublished(courseId, tx);
    if (published) {
      await this.createNextVersion(entityType, entityId, snapshot, tx);
    }
  }

  async createNextVersion(
    entityType: ContentEntityType,
    entityId: string,
    snapshot: Prisma.InputJsonObject,
    tx?: Client,
  ): Promise<void> {
    const client = tx ?? this.appPrisma;
    const latest = await client.contentVersion.findFirst({
      where: { entityType, entityId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    await client.contentVersion.create({
      data: { entityType, entityId, versionNumber: (latest?.versionNumber ?? 0) + 1, snapshot },
    });
  }

  /** Idempotent — only creates version 1 if this entity has never been versioned at all; a re-publish (or a second call for content already versioned by an earlier publish) never creates a spurious duplicate. */
  async ensureVersionExists(
    entityType: ContentEntityType,
    entityId: string,
    snapshot: Prisma.InputJsonObject,
    tx?: Client,
  ): Promise<void> {
    const client = tx ?? this.appPrisma;
    const existing = await client.contentVersion.findFirst({ where: { entityType, entityId } });
    if (!existing) {
      await client.contentVersion.create({
        data: { entityType, entityId, versionNumber: 1, snapshot },
      });
    }
  }

  /**
   * Publish-time backfill (§6.1) — walks every `Lesson`/`Activity`/
   * `Exercise`/`Quiz` currently under `courseId` and ensures each has at
   * least a version-1 snapshot, covering content authored *before*
   * publish (which never went through `snapshotIfPublished`, since the
   * course wasn't published yet at authoring time).
   */
  async backfillVersionsForCourse(courseId: string, tx: Client): Promise<void> {
    const lessons = await tx.lesson.findMany({
      where: { unit: { level: { courseId } } },
      select: {
        id: true,
        title: true,
        description: true,
        order: true,
        estimatedMinutes: true,
        activities: {
          select: {
            id: true,
            type: true,
            title: true,
            content: true,
            order: true,
            exercises: {
              select: {
                id: true,
                activityId: true,
                quizId: true,
                type: true,
                prompt: true,
                correctAnswer: true,
                order: true,
              },
            },
            quizzes: {
              select: {
                id: true,
                activityId: true,
                title: true,
                passingScorePercent: true,
                order: true,
              },
            },
          },
        },
      },
    });

    for (const lesson of lessons) {
      const { activities, ...lessonSnapshot } = lesson;
      await this.ensureVersionExists('LESSON', lesson.id, lessonSnapshot, tx);
      for (const activity of activities) {
        const { exercises, quizzes, ...activitySnapshot } = activity;
        await this.ensureVersionExists('ACTIVITY', activity.id, activitySnapshot, tx);
        for (const exercise of exercises) {
          await this.ensureVersionExists('EXERCISE', exercise.id, exercise, tx);
        }
        for (const quiz of quizzes) {
          await this.ensureVersionExists('QUIZ', quiz.id, quiz, tx);
        }
      }
    }
  }
}
