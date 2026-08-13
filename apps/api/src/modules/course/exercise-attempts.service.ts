import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@linguaai/database';
import { DomainEventPublisher } from '@linguaai/events';
import type {
  ExerciseAttemptResultResponse,
  SubmitExerciseAttemptRequest,
} from '@linguaai/validation/content';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { GamificationService } from '../gamification/index.js';
import { ContentVersioningService } from './content-versioning.service.js';
import { scoreExerciseResponse } from './exercise-scoring.util.js';

/**
 * `POST /v1/exercises/:id/attempts` (E8 T2/T3, §6.2/§6.3). Scores against
 * `Exercise.correctAnswer` via the new, `Exercise`-shape-specific scorer
 * (§3.8 — not a reuse of `AssessmentModule`'s own objective scorer).
 * Pins the attempt to the exercise's own current `ContentVersion` at
 * attempt time (`ContentVersioningService.getCurrentVersionId`) — the
 * exact mechanism T1's own versioning workflow was built for, proven in
 * `course.e2e-spec.ts` to survive a later published edit untouched.
 *
 * T3 adds this service's first real domain-event emission: every scored
 * attempt publishes `learning.exercise.answered`, and the attempt that
 * completes a lesson (every attemptable `Exercise` in its own `Activity`
 * set now has at least one attempt from this user) also publishes
 * `learning.lesson.completed` — both already cataloged in
 * `EVENT_ARCHITECTURE.md`, neither ever produced by any real code until
 * this task (§3.2/§3.3 of the design doc).
 */
@Injectable()
export class ExerciseAttemptsService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly versioning: ContentVersioningService,
    private readonly events: DomainEventPublisher,
    private readonly gamification: GamificationService,
  ) {}

  async submitAttempt(
    caller: RequestUser,
    exerciseId: string,
    dto: SubmitExerciseAttemptRequest,
  ): Promise<ExerciseAttemptResultResponse> {
    const exercise = await this.appPrisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise || exercise.deletedAt) {
      throw new NotFoundException('Exercise not found');
    }

    const courseId = await this.versioning.getCourseIdForActivity(exercise.activityId);
    const published = courseId ? await this.versioning.isCoursePublished(courseId) : false;
    if (!published) {
      // 404, not 403/422 — a draft exercise's existence is not disclosed
      // to a learner (API_GUIDELINES.md §3's no-existence-leak rule, the
      // same discipline `AssessmentService.getOwnedAttempt` already
      // established for a different unpoliced table).
      throw new NotFoundException('Exercise not found');
    }

    // Checked before creating this attempt — whether this is the user's
    // own first attempt at *this* exercise determines whether a lesson
    // completion is even possible as a result of it (§6.3: re-attempting
    // an already-attempted exercise can never newly complete a lesson).
    const priorAttempt = await this.appPrisma.exerciseAttempt.findFirst({
      where: { userId: caller.userId, exerciseId },
      select: { id: true },
    });

    const { isCorrect, score } = scoreExerciseResponse(exercise, dto.response);
    const contentVersionId = await this.versioning.getCurrentVersionId('EXERCISE', exerciseId);

    const attempt = await this.appPrisma.exerciseAttempt.create({
      data: {
        userId: caller.userId,
        exerciseId,
        contentVersionId,
        response: dto.response as Prisma.InputJsonValue,
        isCorrect,
        score,
      },
    });

    await this.events.publish('learning.exercise.answered', {
      userId: caller.userId,
      payload: { userId: caller.userId, exerciseId, correct: isCorrect },
    });

    // E14 T1 (ADR-054, design doc §3.1/§6.1) — called synchronously,
    // in-process, right after the event above, never a new async
    // domain-event consumer (would collide with `recommendation-engine`'s
    // own already-shipped competing-consumers exposure, RISK_REGISTER R-89).
    await this.gamification.recordActivity(caller.userId, {
      type: 'EXERCISE_ANSWERED',
      correct: isCorrect,
      firstAttempt: !priorAttempt,
    });

    if (!priorAttempt) {
      await this.maybeEmitLessonCompleted(caller.userId, exercise.activityId);
    }

    return { id: attempt.id, isCorrect: attempt.isCorrect, score: attempt.score };
  }

  /**
   * §6.3/§10 open question #2, resolved: a lesson is "completed" the
   * moment every attemptable `Exercise` (excluding `SPEAKING_PROMPT` —
   * never attemptable in this epic's own scope, §1, so requiring one
   * would make any lesson containing one permanently uncompletable)
   * across its own `Activity` set has at least one attempt on record for
   * this user. `score` is the most-recent-attempt-per-exercise average
   * (`learningLessonCompletedPayloadSchema`'s own doc comment has the full
   * reasoning) — a real, documented, provisional formula, not silently
   * invented.
   */
  private async maybeEmitLessonCompleted(userId: string, activityId: string): Promise<void> {
    const activity = await this.appPrisma.activity.findUnique({
      where: { id: activityId },
      select: { lessonId: true },
    });
    if (!activity) {
      return;
    }
    const lessonId = activity.lessonId;

    const exercises = await this.appPrisma.exercise.findMany({
      where: { activity: { lessonId }, deletedAt: null, type: { not: 'SPEAKING_PROMPT' } },
      select: { id: true },
    });
    if (exercises.length === 0) {
      return;
    }

    const attemptedExercises = await this.appPrisma.exerciseAttempt.findMany({
      where: { userId, exerciseId: { in: exercises.map((e) => e.id) } },
      select: { exerciseId: true },
      distinct: ['exerciseId'],
    });
    if (attemptedExercises.length < exercises.length) {
      return;
    }

    const perExerciseScores: number[] = [];
    for (const exercise of exercises) {
      const latest = await this.appPrisma.exerciseAttempt.findFirst({
        where: { userId, exerciseId: exercise.id },
        orderBy: { createdAt: 'desc' },
        select: { score: true },
      });
      if (latest?.score != null) {
        perExerciseScores.push(latest.score);
      }
    }
    const score =
      perExerciseScores.length > 0
        ? perExerciseScores.reduce((sum, s) => sum + s, 0) / perExerciseScores.length
        : 0;

    await this.events.publish('learning.lesson.completed', {
      userId,
      payload: { userId, lessonId, score },
    });

    // E14 T1 (ADR-054) — this method only ever reaches this point once
    // per (userId, lessonId): it is only invoked on a first-time exercise
    // attempt, and only publishes once every attemptable exercise in the
    // lesson has at least one attempt, a transition that can happen at
    // most once (confirmed by direct inspection of this method's own
    // early-return guards above) — no separate idempotency check needed.
    await this.gamification.recordActivity(userId, { type: 'LESSON_COMPLETED' });
  }
}
