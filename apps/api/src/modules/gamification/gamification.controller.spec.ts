import type {
  EarnedBadgeResponse,
  GamificationStatusResponse,
  MissionProgressResponse,
} from '@linguaai/validation/gamification';

import { GamificationController } from './gamification.controller.js';
import type { GamificationService } from './gamification.service.js';

function buildReq() {
  return {
    user: { userId: 'user-1', role: 'LEARNER', organizationId: null, orgRole: null },
  };
}

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

    const result = await controller.getStatus(
      buildReq() as unknown as Parameters<typeof controller.getStatus>[0],
    );

    expect(gamification.getStatus).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });

  it("getBadges delegates to GamificationService.getBadges with the caller's own userId", async () => {
    const response: EarnedBadgeResponse[] = [
      {
        badgeId: '33333333-3333-3333-3333-333333333333',
        name: '7-Day Streak',
        description: 'desc',
        iconUrl: null,
        earnedAt: '2026-08-10T00:00:00.000Z',
      },
    ];
    const gamification = { getBadges: jest.fn().mockResolvedValue(response) };
    const controller = new GamificationController(gamification as unknown as GamificationService);

    const result = await controller.getBadges(
      buildReq() as unknown as Parameters<typeof controller.getBadges>[0],
    );

    expect(gamification.getBadges).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });

  it("getMissions delegates to GamificationService.getMissions with the caller's own userId", async () => {
    const response: MissionProgressResponse[] = [
      {
        missionId: '44444444-4444-4444-4444-444444444444',
        type: 'WEEKLY',
        metric: 'LESSONS_COMPLETED',
        targetValue: 5,
        progress: 2,
        rewardXp: 200,
        completedAt: null,
        endsAt: '2026-08-20T00:00:00.000Z',
      },
    ];
    const gamification = { getMissions: jest.fn().mockResolvedValue(response) };
    const controller = new GamificationController(gamification as unknown as GamificationService);

    const result = await controller.getMissions(
      buildReq() as unknown as Parameters<typeof controller.getMissions>[0],
    );

    expect(gamification.getMissions).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });
});
