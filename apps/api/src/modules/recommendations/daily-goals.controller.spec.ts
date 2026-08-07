import type { DailyGoalResponse } from '@linguaai/validation/learning';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { DailyGoalsController } from './daily-goals.controller.js';
import type { DailyGoalsService } from './daily-goals.service.js';

describe('DailyGoalsController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<DailyGoalsController['getToday']>[0];

  it('getToday delegates to DailyGoalsService.getToday with the caller', async () => {
    const response: DailyGoalResponse = {
      id: 'goal-1',
      userId: user.userId,
      learningPlanId: 'plan-1',
      date: '2026-06-16',
      targetXp: 50,
      targetMinutes: 15,
      targetActivities: 3,
      completed: false,
      createdAt: '2026-06-15T20:00:00.000Z',
      updatedAt: '2026-06-15T20:00:00.000Z',
    };
    const service = {
      getToday: jest.fn().mockResolvedValue(response),
    } as unknown as DailyGoalsService;
    const controller = new DailyGoalsController(service);

    const result = await controller.getToday(req);

    expect(service.getToday).toHaveBeenCalledWith(user);
    expect(result).toBe(response);
  });
});
