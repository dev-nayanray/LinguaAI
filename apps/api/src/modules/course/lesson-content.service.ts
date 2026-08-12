import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Activity, Exercise, Lesson, Prisma, PrismaClient, Quiz } from '@linguaai/database';
import type {
  ActivityResponse,
  CreateActivityRequest,
  CreateExerciseRequest,
  CreateLessonRequest,
  CreateQuizRequest,
  DraftListeningActivityContent,
  ExerciseResponse,
  LessonResponse,
  QuizResponse,
  UpdateActivityRequest,
  UpdateExerciseRequest,
  UpdateLessonRequest,
  UpdateQuizRequest,
} from '@linguaai/validation/content';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { SpeechServiceClientService } from '../speech-service-client/speech-service-client.service.js';
import { ContentVersioningService } from './content-versioning.service.js';

function toWireLesson(lesson: Lesson): LessonResponse {
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

function toWireActivity(activity: Activity): ActivityResponse {
  return {
    id: activity.id,
    lessonId: activity.lessonId,
    type: activity.type,
    title: activity.title,
    content: activity.content as Record<string, unknown>,
    order: activity.order,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

function toWireQuiz(quiz: Quiz): QuizResponse {
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

function toWireExercise(exercise: Exercise): ExerciseResponse {
  return {
    id: exercise.id,
    activityId: exercise.activityId,
    quizId: exercise.quizId,
    type: exercise.type,
    prompt: exercise.prompt,
    correctAnswer: exercise.correctAnswer as Record<string, unknown>,
    order: exercise.order,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}

/**
 * `Lesson`/`Activity`/`Exercise`/`Quiz` CRUD (E8 T1, §6.1) — the "content
 * leaf" hierarchy a learner actually attempts, and the only entities
 * `ContentVersion` ever snapshots (`ContentEntityType` excludes
 * `Course`/`Level`/`Unit`, `CourseHierarchyService`'s own doc comment).
 * Every update calls `ContentVersioningService.snapshotIfPublished` —
 * a real no-op while the owning course is still a draft, a real new
 * version the moment it's live, so a learner's already-recorded
 * `ExerciseAttempt` (pinned to the version it was actually attempted
 * against) is never retroactively affected by a later edit.
 */
@Injectable()
export class LessonContentService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly versioning: ContentVersioningService,
    private readonly speechServiceClient: SpeechServiceClientService,
  ) {}

  // --- Lesson ---

  async createLesson(unitId: string, dto: CreateLessonRequest): Promise<LessonResponse> {
    await this.getOwnedUnit(unitId);
    const lesson = await this.appPrisma.lesson.create({
      data: {
        unitId,
        title: dto.title,
        description: dto.description,
        order: dto.order,
        estimatedMinutes: dto.estimatedMinutes,
      },
    });
    return toWireLesson(lesson);
  }

  async updateLesson(id: string, dto: UpdateLessonRequest): Promise<LessonResponse> {
    await this.getOwnedLesson(id);
    const lesson = await this.appPrisma.lesson.update({ where: { id }, data: dto });
    const courseId = await this.versioning.getCourseIdForLesson(id);
    if (courseId) {
      await this.versioning.snapshotIfPublished('LESSON', id, courseId, {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        order: lesson.order,
        estimatedMinutes: lesson.estimatedMinutes,
      });
    }
    return toWireLesson(lesson);
  }

  async deleteLesson(id: string): Promise<void> {
    await this.getOwnedLesson(id);
    await this.appPrisma.lesson.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Activity ---

  /**
   * E12 T1 (§6.2, ADR-051) — a `LISTENING` activity's own request `content`
   * is the *draft* shape (`{ script }`, `createActivityRequestSchema`'s
   * own `refineCreateActivityContent`, `packages/validation/src/content/index.ts`)
   * since no real audio exists yet at request time. Synthesized here,
   * server-side, into the real, persisted shape (`{ audioUrl, transcript }`)
   * before the row is ever written — every other `ActivityType`,
   * `READING` included, is persisted exactly as submitted.
   */
  async createActivity(lessonId: string, dto: CreateActivityRequest): Promise<ActivityResponse> {
    await this.getOwnedLesson(lessonId);
    const content =
      dto.type === 'LISTENING' ? await this.synthesizeListeningContent(dto.content) : dto.content;
    const activity = await this.appPrisma.activity.create({
      data: {
        lessonId,
        type: dto.type,
        title: dto.title,
        content: content as Prisma.InputJsonValue,
        order: dto.order,
      },
    });
    return toWireActivity(activity);
  }

  private async synthesizeListeningContent(
    draftContent: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { script } = draftContent as unknown as DraftListeningActivityContent;
    const audioUrl = await this.speechServiceClient.synthesizeSpeech(script);
    return { audioUrl, transcript: script };
  }

  async updateActivity(id: string, dto: UpdateActivityRequest): Promise<ActivityResponse> {
    await this.getOwnedActivity(id);
    const activity = await this.appPrisma.activity.update({
      where: { id },
      data: { ...dto, content: dto.content as Prisma.InputJsonValue | undefined },
    });
    const courseId = await this.versioning.getCourseIdForActivity(id);
    if (courseId) {
      await this.versioning.snapshotIfPublished('ACTIVITY', id, courseId, {
        id: activity.id,
        type: activity.type,
        title: activity.title,
        content: activity.content as Prisma.InputJsonObject,
        order: activity.order,
      });
    }
    return toWireActivity(activity);
  }

  async deleteActivity(id: string): Promise<void> {
    await this.getOwnedActivity(id);
    await this.appPrisma.activity.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Quiz ---

  async createQuiz(activityId: string, dto: CreateQuizRequest): Promise<QuizResponse> {
    await this.getOwnedActivity(activityId);
    const quiz = await this.appPrisma.quiz.create({
      data: {
        activityId,
        title: dto.title,
        passingScorePercent: dto.passingScorePercent,
        order: dto.order,
      },
    });
    return toWireQuiz(quiz);
  }

  async updateQuiz(id: string, dto: UpdateQuizRequest): Promise<QuizResponse> {
    const existing = await this.getOwnedQuiz(id);
    const quiz = await this.appPrisma.quiz.update({ where: { id }, data: dto });
    const courseId = await this.versioning.getCourseIdForActivity(existing.activityId);
    if (courseId) {
      await this.versioning.snapshotIfPublished('QUIZ', id, courseId, {
        id: quiz.id,
        activityId: quiz.activityId,
        title: quiz.title,
        passingScorePercent: quiz.passingScorePercent,
        order: quiz.order,
      });
    }
    return toWireQuiz(quiz);
  }

  async deleteQuiz(id: string): Promise<void> {
    await this.getOwnedQuiz(id);
    await this.appPrisma.quiz.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Exercise ---

  async createExercise(activityId: string, dto: CreateExerciseRequest): Promise<ExerciseResponse> {
    await this.getOwnedActivity(activityId);
    const exercise = await this.appPrisma.exercise.create({
      data: {
        activityId,
        quizId: dto.quizId,
        type: dto.type,
        prompt: dto.prompt,
        correctAnswer: dto.correctAnswer as Prisma.InputJsonValue,
        order: dto.order,
      },
    });
    return toWireExercise(exercise);
  }

  async updateExercise(id: string, dto: UpdateExerciseRequest): Promise<ExerciseResponse> {
    const existing = await this.getOwnedExercise(id);
    const exercise = await this.appPrisma.exercise.update({
      where: { id },
      data: {
        ...dto,
        correctAnswer: dto.correctAnswer as Prisma.InputJsonValue | undefined,
      } as Prisma.ExerciseUncheckedUpdateInput,
    });
    const courseId = await this.versioning.getCourseIdForActivity(existing.activityId);
    if (courseId) {
      await this.versioning.snapshotIfPublished('EXERCISE', id, courseId, {
        id: exercise.id,
        activityId: exercise.activityId,
        quizId: exercise.quizId,
        type: exercise.type,
        prompt: exercise.prompt,
        correctAnswer: exercise.correctAnswer as Prisma.InputJsonObject,
        order: exercise.order,
      });
    }
    return toWireExercise(exercise);
  }

  async deleteExercise(id: string): Promise<void> {
    await this.getOwnedExercise(id);
    await this.appPrisma.exercise.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // --- Ownership/existence checks (404, matching AssessmentService.getOwnedAttempt's own precedent) ---

  private async getOwnedUnit(id: string) {
    const unit = await this.appPrisma.unit.findUnique({ where: { id } });
    if (!unit || unit.deletedAt) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  private async getOwnedLesson(id: string): Promise<Lesson> {
    const lesson = await this.appPrisma.lesson.findUnique({ where: { id } });
    if (!lesson || lesson.deletedAt) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson;
  }

  private async getOwnedActivity(id: string): Promise<Activity> {
    const activity = await this.appPrisma.activity.findUnique({ where: { id } });
    if (!activity || activity.deletedAt) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  private async getOwnedQuiz(id: string): Promise<Quiz> {
    const quiz = await this.appPrisma.quiz.findUnique({ where: { id } });
    if (!quiz || quiz.deletedAt) {
      throw new NotFoundException('Quiz not found');
    }
    return quiz;
  }

  private async getOwnedExercise(id: string): Promise<Exercise> {
    const exercise = await this.appPrisma.exercise.findUnique({ where: { id } });
    if (!exercise || exercise.deletedAt) {
      throw new NotFoundException('Exercise not found');
    }
    return exercise;
  }
}
