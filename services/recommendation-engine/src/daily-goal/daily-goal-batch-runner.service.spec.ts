import type { DailyGoalService } from './daily-goal.service.js';
import { DailyGoalBatchRunner } from './daily-goal-batch-runner.service.js';

function fakePrisma(plans: Array<{ id: string; userId: string; languageId: string }>) {
  return {
    learningPlan: { findMany: jest.fn().mockResolvedValue(plans) },
  };
}

function fakeDailyGoalService(): jest.Mocked<Pick<DailyGoalService, 'generateForPlan'>> {
  return { generateForPlan: jest.fn().mockResolvedValue(undefined) };
}

describe('DailyGoalBatchRunner', () => {
  it('generates a DailyGoal for every active LearningPlan', async () => {
    const plans = [
      { id: 'plan-1', userId: 'user-1', languageId: 'lang-1' },
      { id: 'plan-2', userId: 'user-2', languageId: 'lang-1' },
    ];
    const prisma = fakePrisma(plans);
    const dailyGoalService = fakeDailyGoalService();
    const runner = new DailyGoalBatchRunner(
      prisma as never,
      dailyGoalService as unknown as DailyGoalService,
    );

    const result = await runner.run();

    expect(prisma.learningPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(dailyGoalService.generateForPlan).toHaveBeenCalledTimes(2);
    expect(dailyGoalService.generateForPlan).toHaveBeenCalledWith(plans[0]);
    expect(dailyGoalService.generateForPlan).toHaveBeenCalledWith(plans[1]);
    expect(result).toEqual({ succeeded: 2, failed: 0 });
  });

  it("one plan's own failure does not stop the rest of the batch", async () => {
    const plans = [
      { id: 'plan-1', userId: 'user-1', languageId: 'lang-1' },
      { id: 'plan-2', userId: 'user-2', languageId: 'lang-1' },
      { id: 'plan-3', userId: 'user-3', languageId: 'lang-1' },
    ];
    const prisma = fakePrisma(plans);
    const dailyGoalService = fakeDailyGoalService();
    dailyGoalService.generateForPlan
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const runner = new DailyGoalBatchRunner(
      prisma as never,
      dailyGoalService as unknown as DailyGoalService,
    );

    const result = await runner.run();

    expect(dailyGoalService.generateForPlan).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ succeeded: 2, failed: 1 });
  });

  it('returns zero counts when there are no active plans', async () => {
    const prisma = fakePrisma([]);
    const dailyGoalService = fakeDailyGoalService();
    const runner = new DailyGoalBatchRunner(
      prisma as never,
      dailyGoalService as unknown as DailyGoalService,
    );

    const result = await runner.run();

    expect(result).toEqual({ succeeded: 0, failed: 0 });
    expect(dailyGoalService.generateForPlan).not.toHaveBeenCalled();
  });
});
