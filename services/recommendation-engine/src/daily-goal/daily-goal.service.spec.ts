import type { DomainEventPublisher } from '@linguaai/events';

import type { WeaknessDetectionService } from '../weakness-detection/weakness-detection.service.js';
import { DAILY_GOAL_READY_EVENT_TYPE } from './daily-goal.constants.js';
import { DailyGoalService } from './daily-goal.service.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const LANGUAGE_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';

function fakeEventPublisher(): jest.Mocked<Pick<DomainEventPublisher, 'publish'>> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function fakePrisma() {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    dailyGoal: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    learningPlan: {
      findUnique: jest.fn().mockResolvedValue({ id: PLAN_ID, milestones: { version: 1 } }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function fakeWeaknessDetection(
  results: Array<{ skill: string; isWeak: boolean; reason: string | null }> = [],
): jest.Mocked<Pick<WeaknessDetectionService, 'detectWeakSkills'>> {
  return { detectWeakSkills: jest.fn().mockResolvedValue(results) };
}

describe('DailyGoalService', () => {
  function buildService(
    prisma: ReturnType<typeof fakePrisma>,
    weaknessDetection: ReturnType<typeof fakeWeaknessDetection>,
    eventPublisher: ReturnType<typeof fakeEventPublisher> = fakeEventPublisher(),
  ) {
    return new DailyGoalService(
      prisma as never,
      weaknessDetection as unknown as WeaknessDetectionService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  }

  it("computes tomorrow's date in the user's own timezone and upserts the DailyGoal for it", async () => {
    const prisma = fakePrisma();
    prisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    const service = buildService(prisma, fakeWeaknessDetection());
    // Overriding `Date.now` alone does not affect `new Date()` (a real,
    // easy-to-miss gotcha — the no-arg `Date` constructor does not
    // dispatch through the `Date.now` property internally) — real fake
    // timers are required to actually control what `new Date()` returns
    // inside the service under test.
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') });

    try {
      await service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID });
    } finally {
      jest.useRealTimers();
    }

    expect(prisma.dailyGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_date: { userId: USER_ID, date: new Date('2026-06-16T00:00:00.000Z') } },
      }),
    );
  });

  it('applies the base targets with no adjustment when there is no recent DailyGoal history', async () => {
    const prisma = fakePrisma();
    const service = buildService(prisma, fakeWeaknessDetection());

    await service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID });

    expect(prisma.dailyGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          targetXp: 50,
          targetMinutes: 15,
          targetActivities: 3,
        }) as unknown,
      }),
    );
  });

  it('scales targets up when recent goals were mostly completed', async () => {
    const prisma = fakePrisma();
    prisma.dailyGoal.findMany.mockResolvedValue([
      { completed: true },
      { completed: true },
      { completed: false },
    ]);
    const service = buildService(prisma, fakeWeaknessDetection());

    await service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID });

    expect(prisma.dailyGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ targetXp: 55, targetMinutes: 17 }) as unknown, // round(50*1.1), round(15*1.1)
      }),
    );
  });

  it('adds the weak-skill activity bonus and records weak skills on the LearningPlan when any skill is weak', async () => {
    const prisma = fakePrisma();
    const weaknessDetection = fakeWeaknessDetection([
      { skill: 'READING', isWeak: true, reason: 'REGRESSED' },
      { skill: 'WRITING', isWeak: false, reason: null },
    ]);
    const service = buildService(prisma, weaknessDetection);

    await service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID });

    expect(prisma.dailyGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ targetActivities: 4 }) as unknown, // base 3 + bonus 1
      }),
    );
    expect(prisma.learningPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: {
        milestones: expect.objectContaining({ weakSkills: ['READING'] }) as unknown,
      },
    });
  });

  it('does not touch the LearningPlan milestones when no skill is weak', async () => {
    const prisma = fakePrisma();
    const service = buildService(
      prisma,
      fakeWeaknessDetection([{ skill: 'READING', isWeak: false, reason: null }]),
    );

    await service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID });

    expect(prisma.learningPlan.update).not.toHaveBeenCalled();
  });

  it('falls back to UTC when the user has no timezone on record, rather than throwing', async () => {
    const prisma = fakePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = buildService(prisma, fakeWeaknessDetection());

    await expect(
      service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID }),
    ).resolves.toBeUndefined();
    expect(prisma.dailyGoal.upsert).toHaveBeenCalled();
  });

  it('publishes recommendation.daily_goal.ready with the same values just upserted, after the upsert (§6.5)', async () => {
    const prisma = fakePrisma();
    const eventPublisher = fakeEventPublisher();
    const service = buildService(prisma, fakeWeaknessDetection(), eventPublisher);
    jest.useFakeTimers({ now: new Date('2026-06-15T12:00:00.000Z') });

    try {
      await service.generateForPlan({ id: PLAN_ID, userId: USER_ID, languageId: LANGUAGE_ID });
    } finally {
      jest.useRealTimers();
    }

    expect(prisma.dailyGoal.upsert).toHaveBeenCalled();
    const upsertOrder = prisma.dailyGoal.upsert.mock.invocationCallOrder[0];
    const publishOrder = eventPublisher.publish.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(publishOrder as number);

    expect(eventPublisher.publish).toHaveBeenCalledWith(DAILY_GOAL_READY_EVENT_TYPE, {
      userId: USER_ID,
      payload: {
        userId: USER_ID,
        date: '2026-06-16',
        targetXp: 50,
        targetMinutes: 15,
        targetActivities: 3,
      },
    });
  });
});
