import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LearningPlan, Prisma, PrismaClient } from '@linguaai/database';
import { toLocalCalendarDate } from '@linguaai/utils';

import { RECOMMENDATION_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { WeaknessDetectionService } from '../weakness-detection/weakness-detection.service.js';
import { computeAdjustmentMultiplier, nextCalendarDate } from './daily-goal-adjustment.util.js';
import {
  BASE_TARGET_ACTIVITIES,
  BASE_TARGET_MINUTES,
  BASE_TARGET_XP,
  RECENT_DAILY_GOALS_FOR_ADJUSTMENT,
  WEAK_SKILL_ACTIVITY_BONUS,
} from './daily-goal.constants.js';

/**
 * `DailyGoal` nightly generation (E7 T3, §6.3) — one plan's own target for
 * "tomorrow." `date` is computed in the *user's own timezone*
 * (`toLocalCalendarDate`, `packages/utils` — already built for exactly
 * this class of problem, E14's own streak logic), resolving the design
 * doc's own §10 open question #1: a global UTC "tomorrow" would be wrong
 * for any user not in a UTC-adjacent zone the moment the nightly job runs
 * near a calendar-day boundary.
 */
@Injectable()
export class DailyGoalService {
  private readonly logger = new Logger(DailyGoalService.name);

  constructor(
    @Inject(RECOMMENDATION_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly weaknessDetection: WeaknessDetectionService,
  ) {}

  async generateForPlan(plan: Pick<LearningPlan, 'id' | 'userId' | 'languageId'>): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: plan.userId },
      select: { timezone: true },
    });
    // Falls back to UTC rather than throwing — a real, if unlikely, race
    // (the user row could theoretically be gone by the time this nightly
    // batch reaches their plan); a missing timezone must not abort the
    // whole batch run for every other user (`DailyGoalModule`'s own
    // per-plan try/catch already isolates failures, this is a second,
    // narrower layer of the same discipline).
    const timezone = user?.timezone ?? 'UTC';
    const today = toLocalCalendarDate(new Date(), timezone);
    const tomorrow = nextCalendarDate(today);
    const tomorrowDate = new Date(`${tomorrow}T00:00:00.000Z`);

    const recentGoals = await this.prisma.dailyGoal.findMany({
      where: { userId: plan.userId },
      orderBy: { date: 'desc' },
      take: RECENT_DAILY_GOALS_FOR_ADJUSTMENT,
      select: { completed: true },
    });
    const multiplier = computeAdjustmentMultiplier(recentGoals.map((goal) => goal.completed));

    const weaknessResults = await this.weaknessDetection.detectWeakSkills(
      plan.userId,
      plan.languageId,
    );
    const weakSkills = weaknessResults
      .filter((result) => result.isWeak)
      .map((result) => result.skill);

    const targetXp = Math.round(BASE_TARGET_XP * multiplier);
    const targetMinutes = Math.round(BASE_TARGET_MINUTES * multiplier);
    const targetActivities =
      Math.round(BASE_TARGET_ACTIVITIES * multiplier) +
      (weakSkills.length > 0 ? WEAK_SKILL_ACTIVITY_BONUS : 0);

    await this.prisma.dailyGoal.upsert({
      where: { userId_date: { userId: plan.userId, date: tomorrowDate } },
      create: {
        userId: plan.userId,
        learningPlanId: plan.id,
        date: tomorrowDate,
        targetXp,
        targetMinutes,
        targetActivities,
      },
      update: { learningPlanId: plan.id, targetXp, targetMinutes, targetActivities },
    });

    if (weakSkills.length > 0) {
      await this.recordWeakSkillsOnPlan(plan.id, weakSkills);
    }

    this.logger.log(
      `Generated DailyGoal for user ${plan.userId} (${tomorrow}, xp=${targetXp}, minutes=${targetMinutes}, activities=${targetActivities})`,
    );
  }

  /**
   * §6.3's own stated design: a detected weak skill biases future
   * recommendations "via `LearningPlan.milestones`, not a separate
   * field" — `DailyGoal` itself carries no per-skill columns.
   */
  private async recordWeakSkillsOnPlan(
    learningPlanId: string,
    weakSkills: readonly string[],
  ): Promise<void> {
    const plan = await this.prisma.learningPlan.findUnique({ where: { id: learningPlanId } });
    if (!plan) {
      return;
    }
    const milestones: Prisma.InputJsonObject = {
      ...(plan.milestones as Prisma.InputJsonObject),
      weakSkills,
      weakSkillsUpdatedAt: new Date().toISOString(),
    };
    await this.prisma.learningPlan.update({
      where: { id: learningPlanId },
      data: { milestones },
    });
  }
}
