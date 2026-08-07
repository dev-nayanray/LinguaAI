import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { DailyGoalsService } from './daily-goals.service.js';

const USER: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };

const GOAL = {
  id: 'goal-1',
  userId: 'u-1',
  learningPlanId: 'plan-1',
  date: new Date('2026-06-16T00:00:00.000Z'),
  targetXp: 50,
  targetMinutes: 15,
  targetActivities: 3,
  completed: false,
  createdAt: new Date('2026-06-15T20:00:00.000Z'),
  updatedAt: new Date('2026-06-15T20:00:00.000Z'),
};

function fakePrisma(userResult: unknown, goalResult: unknown) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(userResult) },
    dailyGoal: { findUnique: jest.fn().mockResolvedValue(goalResult) },
  };
}

describe('DailyGoalsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves 'today' in the caller's own local timezone and looks up the matching (userId, date) DailyGoal row", async () => {
    // Los Angeles is UTC-7 in June (DST) — 2026-06-16T02:00:00Z is still
    // 2026-06-15 locally, the same class of boundary case
    // `DailyGoalService.generateForPlan`'s own T3 tests already exercise.
    jest.useFakeTimers({ now: new Date('2026-06-16T02:00:00.000Z') });
    const prisma = fakePrisma({ timezone: 'America/Los_Angeles' }, GOAL);
    const service = new DailyGoalsService(prisma as unknown as PrismaClient);

    const result = await service.getToday(USER);

    expect(prisma.dailyGoal.findUnique).toHaveBeenCalledWith({
      where: { userId_date: { userId: 'u-1', date: new Date('2026-06-15T00:00:00.000Z') } },
    });
    expect(result).toEqual({
      id: 'goal-1',
      userId: 'u-1',
      learningPlanId: 'plan-1',
      date: '2026-06-16',
      targetXp: 50,
      targetMinutes: 15,
      targetActivities: 3,
      completed: false,
      createdAt: '2026-06-15T20:00:00.000Z',
      updatedAt: '2026-06-15T20:00:00.000Z',
    });
  });

  it('throws NotFoundException when the caller has no User row on record', async () => {
    const prisma = fakePrisma(null, GOAL);
    const service = new DailyGoalsService(prisma as unknown as PrismaClient);

    await expect(service.getToday(USER)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when no DailyGoal exists for today', async () => {
    const prisma = fakePrisma({ timezone: 'UTC' }, null);
    const service = new DailyGoalsService(prisma as unknown as PrismaClient);

    await expect(service.getToday(USER)).rejects.toThrow(NotFoundException);
  });
});
