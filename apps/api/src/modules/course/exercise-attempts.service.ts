import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@linguaai/database';
import type {
  ExerciseAttemptResultResponse,
  SubmitExerciseAttemptRequest,
} from '@linguaai/validation/content';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { ContentVersioningService } from './content-versioning.service.js';
import { scoreExerciseResponse } from './exercise-scoring.util.js';

/**
 * `POST /v1/exercises/:id/attempts` (E8 T2, §6.2). Scores against
 * `Exercise.correctAnswer` via the new, `Exercise`-shape-specific scorer
 * (§3.8 — not a reuse of `AssessmentModule`'s own objective scorer).
 * Pins the attempt to the exercise's own current `ContentVersion` at
 * attempt time (`ContentVersioningService.getCurrentVersionId`) — the
 * exact mechanism T1's own versioning workflow was built for, proven in
 * `course.e2e-spec.ts` to survive a later published edit untouched.
 */
@Injectable()
export class ExerciseAttemptsService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly versioning: ContentVersioningService,
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

    return { id: attempt.id, isCorrect: attempt.isCorrect, score: attempt.score };
  }
}
