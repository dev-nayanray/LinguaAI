import type { GamificationStatusResponse } from '@linguaai/validation/gamification';

import { GamificationController } from './gamification.controller.js';
import type { GamificationService } from './gamification.service.js';

describe('GamificationController', () => {
  it("getStatus delegates to GamificationService.getStatus with the caller's own userId", async () => {
    const response: GamificationStatusResponse = {
      totalXp: 120,
      level: 2,
      currentStreak: 7,
      longestStreak: 12,
    };
    const gamification = { getStatus: jest.fn().mockResolvedValue(response) };
    const controller = new GamificationController(gamification as unknown as GamificationService);
    const req = {
      user: { userId: 'user-1', role: 'LEARNER', organizationId: null, orgRole: null },
    };

    const result = await controller.getStatus(
      req as unknown as Parameters<typeof controller.getStatus>[0],
    );

    expect(gamification.getStatus).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });
});
