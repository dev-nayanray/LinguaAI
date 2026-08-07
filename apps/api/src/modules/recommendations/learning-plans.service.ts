import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LearningPlan, PrismaClient } from '@linguaai/database';
import type { CurrentLearningPlanQuery, LearningPlanResponse } from '@linguaai/validation/learning';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';

function toWireLearningPlan(plan: LearningPlan): LearningPlanResponse {
  return {
    id: plan.id,
    userId: plan.userId,
    languageId: plan.languageId,
    goal: plan.goal,
    targetDate: plan.targetDate ? plan.targetDate.toISOString() : null,
    milestones: plan.milestones as Record<string, unknown>,
    isActive: plan.isActive,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * `GET /v1/learning-plans/current` (E7 T5, §6.6). Reads `recommendation-engine`'s
 * own precomputed `LearningPlan` rows directly via `APP_PRISMA_CLIENT` — the
 * same "read the shared table, don't call the owning service over HTTP"
 * pattern `AssessmentService` already established for its own tables;
 * `recommendation-engine` has no public HTTP surface to a frontend at all
 * (ADR-033's internal-only trust model, §1 of the epic doc). `assessment.prisma`'s
 * own header comment confirms `LearningPlan` carries no RLS policy, so
 * ownership is enforced by hand (scoping every query to `caller.userId`),
 * the same discipline `AssessmentService.getOwnedAttempt` established.
 */
@Injectable()
export class LearningPlansService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  /**
   * `LearningPlan` has no uniqueness constraint scoping "one active plan per
   * user" (only `@@index([userId, languageId])`) — `UserProfile.targetLanguages`
   * (identity.prisma) is a real array, so a genuinely multi-language learner
   * can have more than one active plan at once. A real scope gap §6.6's own
   * design text left unaddressed, resolved here: `query.languageId`, when
   * given, resolves that language's own active plan; when omitted, falls
   * back to the most-recently-updated active plan across every language —
   * a documented default for the common single-target-language case, not a
   * silently arbitrary one.
   */
  async getCurrent(
    caller: RequestUser,
    query: CurrentLearningPlanQuery,
  ): Promise<LearningPlanResponse> {
    const plan = await this.appPrisma.learningPlan.findFirst({
      where: {
        userId: caller.userId,
        isActive: true,
        ...(query.languageId ? { languageId: query.languageId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!plan) {
      throw new NotFoundException('No active learning plan found');
    }
    return toWireLearningPlan(plan);
  }
}
