import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient, type DailyGoal } from '@linguaai/database';

import { AppModule } from '../src/app.module.js';
import { DAILY_GOAL_JOB_NAME } from '../src/daily-goal/daily-goal.constants.js';
import { createDailyGoalQueue } from '../src/daily-goal/daily-goal.queue.js';

/**
 * Real, live proof of the whole nightly-job pipeline (E7 T3's own evidence
 * bar: "a real BullMQ job execution test") — not a mocked substitute.
 * Boots the real `AppModule` (starting `DailyGoalModule`'s own real
 * `Worker`, the same lifecycle hook a real deployed instance relies on),
 * enqueues a real one-off job on the real `daily-goal-generation` queue
 * (bypassing the registered repeatable job's own 3am cron schedule — this
 * suite triggers an immediate run instead of waiting for one), and
 * asserts a real `DailyGoal` row lands in real Postgres for a real,
 * fixture `LearningPlan`.
 */
describe('DailyGoal nightly job (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  let userId: string;
  let languageId: string;
  let learningPlanId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Starts DailyGoalModule's own real Worker (onModuleInit).
    await app.init();

    const user = await setupPrisma.user.create({
      data: {
        email: `e7-t3-${randomUUID().slice(0, 8)}@test.local`,
        displayName: 'E7 T3 Test User',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
      },
    });
    userId = user.id;

    const language = await setupPrisma.language.create({
      data: { code: `e7-t3-${randomUUID().slice(0, 8)}`, name: 'E7 T3 Test Language' },
    });
    languageId = language.id;

    const plan = await setupPrisma.learningPlan.create({
      data: {
        userId,
        languageId,
        goal: 'General fluency',
        milestones: { version: 1 },
        isActive: true,
      },
    });
    learningPlanId = plan.id;
  });

  afterAll(async () => {
    await setupPrisma.dailyGoal.deleteMany({ where: { userId } });
    await setupPrisma.learningPlan.deleteMany({ where: { userId } });
    await setupPrisma.user.delete({ where: { id: userId } });
    await setupPrisma.language.delete({ where: { id: languageId } });
    await setupPrisma.$disconnect();
    await app.close();
    // A real BullMQ/ioredis teardown race, found while building this
    // suite: `RedisConnection`'s own internal `init()` promise can still
    // be settling when `close()` returns, and if it later rejects with
    // "Connection is closed" *after* `Worker`/`Queue` have already
    // stripped their own listeners during their own teardown, the
    // rejection surfaces unhandled — crashing whichever e2e spec file
    // Jest happens to run next in the same process (`--runInBand`), not
    // this one. A short grace period here, after `app.close()`, lets that
    // straggling rejection settle while this file's own listeners are
    // still attached, instead of it landing on a neighboring file.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  /** Polls real Postgres — the Worker processes asynchronously off the queue, not synchronously with `queue.add()`. */
  async function waitForDailyGoal(timeoutMs = 10000): Promise<DailyGoal> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const goal = await setupPrisma.dailyGoal.findFirst({ where: { userId } });
      if (goal) {
        return goal;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Timed out waiting for the real Worker to process the daily-goal job');
  }

  it('a real job execution produces a real DailyGoal row for an active LearningPlan', async () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set — see .env');
    }
    const queue = createDailyGoalQueue(redisUrl);
    // `Queue` is an `EventEmitter` — an unlistened `'error'` event
    // throws unhandled in Node (the same real bug `DailyGoalModule`'s
    // own doc comment explains, found while building this exact test).
    queue.on('error', () => undefined);
    try {
      // A real, immediate one-off job — the same queue/job name the
      // registered repeatable job uses, triggering the already-running
      // real Worker without waiting for its own 3am cron schedule.
      await queue.add(DAILY_GOAL_JOB_NAME, {});

      const goal = await waitForDailyGoal();
      expect(goal.userId).toBe(userId);
      expect(goal.learningPlanId).toBe(learningPlanId);
      expect(goal.targetXp).toBeGreaterThan(0);
      expect(goal.targetMinutes).toBeGreaterThan(0);
      expect(goal.targetActivities).toBeGreaterThan(0);
      expect(goal.completed).toBe(false);
    } finally {
      await queue.close();
    }
  }, 20000);
});
