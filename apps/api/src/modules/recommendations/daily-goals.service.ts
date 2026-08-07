import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DailyGoal, PrismaClient } from '@linguaai/database';
import type { DailyGoalResponse } from '@linguaai/validation/learning';
import { toLocalCalendarDate } from '@linguaai/utils';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';

function toWireDailyGoal(goal: DailyGoal): DailyGoalResponse {
  return {
    id: goal.id,
    userId: goal.userId,
    learningPlanId: goal.learningPlanId,
    date: toLocalCalendarDate(goal.date, 'UTC'),
    targetXp: goal.targetXp,
    targetMinutes: goal.targetMinutes,
    targetActivities: goal.targetActivities,
    completed: goal.completed,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

/**
 * `GET /v1/daily-goals/today` (E7 T5, §6.6) — the design doc's own named
 * open decision ("timezone-correctness... is this task's own concrete
 * design decision to make, not resolved here"), resolved here by reusing
 * the exact mechanism `DailyGoalService.generateForPlan()` (E7 T3) already
 * writes rows with: `toLocalCalendarDate(now, user.timezone)` computes the
 * caller's own local calendar date, then looks up the `(userId, date)`
 * row that date's own generation run would have upserted — the same
 * function on both the write and read path, so "today" can never disagree
 * between them the way two independently-implemented timezone calculations
 * could. `DailyGoal` carries no `languageId` (`@@unique([userId, date])`
 * only, unlike `LearningPlan`) — one goal per user per day platform-wide —
 * so no query-param disambiguation is needed here the way `.../current` needs.
 */
@Injectable()
export class DailyGoalsService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async getToday(caller: RequestUser): Promise<DailyGoalResponse> {
    const user = await this.appPrisma.user.findUnique({
      where: { id: caller.userId },
      select: { timezone: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const today = toLocalCalendarDate(new Date(), user.timezone);
    const goal = await this.appPrisma.dailyGoal.findUnique({
      where: { userId_date: { userId: caller.userId, date: new Date(`${today}T00:00:00.000Z`) } },
    });
    if (!goal) {
      throw new NotFoundException('No daily goal found for today');
    }
    return toWireDailyGoal(goal);
  }
}
