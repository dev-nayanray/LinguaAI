import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GoalType, Prisma, PrismaClient } from '@linguaai/database';
import type { AssessmentAttemptCompletedPayload } from '@linguaai/validation/learning';

import { RECOMMENDATION_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';

/** Bumped on any behavior-changing edit to `milestones`'s own shape (E7 design doc §6.2's own "versioned JSON" requirement) — mirrors `PromptTemplate`'s own versioning discipline (ai-engine), applied here to a different kind of generated artifact. */
export const LEARNING_PLAN_MILESTONES_VERSION = 1;

/** Display copy for `UserProfile.goalType` — `LearningPlan.goal` is a free `String`, not the enum itself, so a plan reads naturally on a future dashboard without the client needing its own copy of this mapping. */
const GOAL_LABELS: Record<GoalType, string> = {
  TRAVEL: 'Travel',
  CAREER: 'Career',
  EXAM: 'Exam preparation',
  GENERAL_FLUENCY: 'General fluency',
};

/**
 * `LearningPlan` generation (E7 T2, §6.2) — the first real consumer logic
 * `assessment.attempt.completed` ever gets. Deliberately does not branch on
 * `payload.type` (`PLACEMENT` vs `REASSESSMENT`): a `REASSESSMENT` can only
 * complete once a prior `PLACEMENT` already has (E6 T6's own precondition),
 * and that prior completion would already have created this user's active
 * plan through this exact same handler — so "update the active plan if one
 * exists, else create it" (a single rule, not two branches) already
 * produces the design doc's own §6.2 "create on PLACEMENT / update on
 * REASSESSMENT" behavior as a natural consequence, not a coincidence.
 *
 * Idempotent by construction (EVENT_ARCHITECTURE.md §4's "natural
 * idempotency key" alternative to a separate processed-`eventId` table,
 * the same choice `AssessmentService.completeAttempt`'s own re-completion
 * handling already made): reprocessing the same event twice — a real
 * possibility under BullMQ's at-least-once delivery — finds the same
 * active plan both times and writes the same `milestones` again, never
 * creating a duplicate.
 */
@Injectable()
export class LearningPlanService {
  private readonly logger = new Logger(LearningPlanService.name);

  constructor(@Inject(RECOMMENDATION_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async handleAssessmentAttemptCompleted(
    userId: string,
    payload: AssessmentAttemptCompletedPayload,
  ): Promise<void> {
    const milestones: Prisma.InputJsonObject = {
      version: LEARNING_PLAN_MILESTONES_VERSION,
      generatedFromAttemptId: payload.attemptId,
      generatedAt: new Date().toISOString(),
      skillLevels: payload.skillResults,
    };

    const existing = await this.prisma.learningPlan.findFirst({
      where: { userId, languageId: payload.languageId, isActive: true },
    });

    if (existing) {
      await this.prisma.learningPlan.update({
        where: { id: existing.id },
        data: { milestones },
      });
      this.logger.log(
        `Updated LearningPlan ${existing.id} for user ${userId} from attempt ${payload.attemptId}`,
      );
      return;
    }

    // Onboarding-selected goal (PRD.md Journey A step 1) — a real, existing
    // field, not invented here. `UserProfile` may not exist yet for a
    // caller this consumer has never seen before (a genuinely possible
    // ordering race, not assumed away): falls back to the same default a
    // brand-new profile's own onboarding flow would eventually set.
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const goal = profile ? GOAL_LABELS[profile.goalType] : GOAL_LABELS.GENERAL_FLUENCY;

    const created = await this.prisma.learningPlan.create({
      data: { userId, languageId: payload.languageId, goal, milestones },
    });
    this.logger.log(
      `Created LearningPlan ${created.id} for user ${userId} from attempt ${payload.attemptId}`,
    );
  }
}
