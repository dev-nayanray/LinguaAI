import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Activity,
  Course,
  Exercise,
  Lesson,
  Level,
  PrismaClient,
  Quiz,
  Unit,
} from '@linguaai/database';
import type {
  CourseDetailResponse,
  CourseListQuery,
  CourseListResponse,
  ExercisePublicView,
  LessonDetailResponse,
} from '@linguaai/validation/content';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

function toWireCourseSummary(course: Course): CourseListResponse['data'][number] {
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

function toWireLesson(
  lesson: Lesson,
): CourseDetailResponse['levels'][number]['units'][number]['lessons'][number] {
  return {
    id: lesson.id,
    unitId: lesson.unitId,
    title: lesson.title,
    description: lesson.description,
    order: lesson.order,
    estimatedMinutes: lesson.estimatedMinutes,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
  };
}

function toWireExercisePublicView(exercise: Exercise): ExercisePublicView {
  return {
    id: exercise.id,
    activityId: exercise.activityId,
    quizId: exercise.quizId,
    type: exercise.type,
    prompt: exercise.prompt,
    order: exercise.order,
  };
}

function toWireQuiz(quiz: Quiz): LessonDetailResponse['activities'][number]['quizzes'][number] {
  return {
    id: quiz.id,
    activityId: quiz.activityId,
    title: quiz.title,
    passingScorePercent: quiz.passingScorePercent,
    order: quiz.order,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
  };
}

type ActivityWithLeaves = Activity & { exercises: Exercise[]; quizzes: Quiz[] };

function toWireActivity(activity: ActivityWithLeaves): LessonDetailResponse['activities'][number] {
  return {
    id: activity.id,
    lessonId: activity.lessonId,
    type: activity.type,
    title: activity.title,
    content: activity.content as Record<string, unknown>,
    order: activity.order,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    exercises: activity.exercises.map(toWireExercisePublicView),
    quizzes: activity.quizzes.map(toWireQuiz),
  };
}

/**
 * Learner-facing published-only reads (E8 T2, §6.2) — pure reads,
 * published-only, never leaking `Exercise.correctAnswer` (the answer
 * key). `content.prisma` carries no RLS policy, ownership is "is this
 * published," not "does this belong to the caller" — every authenticated
 * user sees the same published catalog, matching a real course catalog's
 * own nature (not per-user private data).
 */
@Injectable()
export class CourseCatalogService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async listCourses(query: CourseListQuery): Promise<CourseListResponse> {
    const where = {
      publishedAt: { not: null },
      deletedAt: null,
      ...(query.languageId ? { languageId: query.languageId } : {}),
    };
    const [items, total] = await Promise.all([
      this.appPrisma.course.findMany({
        where,
        orderBy: { title: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.appPrisma.course.count({ where }),
    ]);
    return {
      data: items.map(toWireCourseSummary),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /**
   * Course -> Levels -> Units -> Lessons, shallow (no Activity/Exercise
   * content — §6.2's own "lazy-loaded" design, `getLessonDetail` is the
   * separate per-lesson fetch for that).
   */
  async getCourseDetail(id: string): Promise<CourseDetailResponse> {
    const course = await this.appPrisma.course.findUnique({
      where: { id },
      include: {
        levels: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            units: {
              where: { deletedAt: null },
              orderBy: { order: 'asc' },
              include: {
                lessons: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!course || !course.publishedAt || course.deletedAt) {
      throw new NotFoundException('Course not found');
    }

    return {
      ...toWireCourseSummary(course),
      levels: course.levels.map((level: Level & { units: (Unit & { lessons: Lesson[] })[] }) => ({
        id: level.id,
        courseId: level.courseId,
        cefrLevel: level.cefrLevel,
        title: level.title,
        description: level.description,
        order: level.order,
        createdAt: level.createdAt.toISOString(),
        updatedAt: level.updatedAt.toISOString(),
        units: level.units.map((unit: Unit & { lessons: Lesson[] }) => ({
          id: unit.id,
          levelId: unit.levelId,
          title: unit.title,
          description: unit.description,
          order: unit.order,
          createdAt: unit.createdAt.toISOString(),
          updatedAt: unit.updatedAt.toISOString(),
          lessons: unit.lessons.map(toWireLesson),
        })),
      })),
    };
  }

  /** The real payload a learner needs to take a lesson — its own Activities, each with its own servable Exercises (public view) and Quizzes. Draft-course lessons 404, never leaked (§5.1 of the design doc's own scoping discipline, applied here to unpublished content). */
  async getLessonDetail(id: string): Promise<LessonDetailResponse> {
    const lesson = await this.appPrisma.lesson.findUnique({
      where: { id },
      include: {
        unit: { include: { level: { include: { course: true } } } },
        activities: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          include: {
            exercises: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
            quizzes: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
          },
        },
      },
    });
    const course = lesson?.unit.level.course;
    if (!lesson || lesson.deletedAt || !course || !course.publishedAt || course.deletedAt) {
      throw new NotFoundException('Lesson not found');
    }

    return { ...toWireLesson(lesson), activities: lesson.activities.map(toWireActivity) };
  }
}
