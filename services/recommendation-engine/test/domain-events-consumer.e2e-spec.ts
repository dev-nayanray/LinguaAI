import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient, type LearningPlan } from '@linguaai/database';
import { createDomainEventsQueue, DomainEventPublisher } from '@linguaai/events';
import type { Queue } from 'bullmq';

import { AppModule } from '../src/app.module.js';

/**
 * Real, live proof of the whole pipeline (E7 T2's own evidence bar: "a real
 * integration test proving a REASSESSMENT does not create a duplicate
 * active plan") — not a mocked substitute for it. Boots the real
 * `AppModule` (starting `DomainEventsModule`'s own real `Worker` against
 * the real local Redis), publishes real `assessment.attempt.completed`
 * events onto the real `domain-events` queue via the same
 * `DomainEventPublisher`/`createDomainEventsQueue` `apps/api` itself uses,
 * and asserts against real rows in the real local Postgres. The one thing
 * this suite does *not* exercise is a second, independent consumer racing
 * for the same jobs — this module's own doc comment (`domain-events.module.ts`)
 * already documents that real, flagged gap; a real second consumer doesn't
 * exist yet to race against.
 */
describe('domain-events consumer: assessment.attempt.completed -> LearningPlan (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  let queue: Queue;
  let publisher: DomainEventPublisher;
  let userId: string;
  let languageId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Starts DomainEventsModule's own real Worker (onModuleInit) — the
    // same lifecycle hook a real deployed instance relies on.
    await app.init();

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set — see .env');
    }
    queue = createDomainEventsQueue(redisUrl);
    // `Queue` is an `EventEmitter` — an unlistened `'error'` event throws
    // unhandled in Node (the same real bug `DailyGoalModule`'s own doc
    // comment explains, found while building this task's own e2e suite).
    queue.on('error', () => undefined);
    publisher = new DomainEventPublisher(queue);

    const user = await setupPrisma.user.create({
      data: {
        email: `e7-t2-${randomUUID().slice(0, 8)}@test.local`,
        displayName: 'E7 T2 Test User',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    userId = user.id;

    const language = await setupPrisma.language.create({
      data: { code: `e7-t2-${randomUUID().slice(0, 8)}`, name: 'E7 T2 Test Language' },
    });
    languageId = language.id;
  });

  afterAll(async () => {
    await setupPrisma.dailyGoal.deleteMany({ where: { userId } });
    await setupPrisma.learningPlan.deleteMany({ where: { userId } });
    await setupPrisma.user.delete({ where: { id: userId } });
    await setupPrisma.language.delete({ where: { id: languageId } });
    await queue.close();
    await setupPrisma.$disconnect();
    await app.close();
    // Grace period for a straggling BullMQ/ioredis teardown rejection to
    // settle here rather than landing on whichever e2e spec file Jest
    // runs next in the same `--runInBand` process — see
    // `daily-goal-job.e2e-spec.ts`'s own identical fix/doc comment for
    // the full explanation.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  /** Polls real Postgres for up to `timeoutMs` — the Worker processes asynchronously off the queue, not synchronously with `publish()`. */
  async function waitForLearningPlan(
    predicate: (plan: LearningPlan) => boolean,
    timeoutMs = 10000,
  ): Promise<LearningPlan> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const plan = await setupPrisma.learningPlan.findFirst({
        where: { userId, languageId, isActive: true },
      });
      if (plan && predicate(plan)) {
        return plan;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Timed out waiting for the real Worker to process the published event');
  }

  it('creates a real LearningPlan from a real published event, and a REASSESSMENT updates it in place rather than duplicating it', async () => {
    const firstAttemptId = randomUUID();
    await publisher.publish('assessment.attempt.completed', {
      userId,
      payload: {
        attemptId: firstAttemptId,
        languageId,
        type: 'PLACEMENT',
        skillResults: [
          { skill: 'READING', cefrLevel: 'B1', confidence: 0.6, lowConfidence: false },
        ],
      },
    });

    const created = await waitForLearningPlan(
      (plan) =>
        (plan.milestones as { generatedFromAttemptId?: string }).generatedFromAttemptId ===
        firstAttemptId,
    );
    expect(created.userId).toBe(userId);
    expect(created.languageId).toBe(languageId);
    expect(created.isActive).toBe(true);

    const secondAttemptId = randomUUID();
    await publisher.publish('assessment.attempt.completed', {
      userId,
      payload: {
        attemptId: secondAttemptId,
        languageId,
        type: 'REASSESSMENT',
        skillResults: [
          { skill: 'READING', cefrLevel: 'B2', confidence: 0.7, lowConfidence: false },
        ],
      },
    });

    const updated = await waitForLearningPlan(
      (plan) =>
        (plan.milestones as { generatedFromAttemptId?: string }).generatedFromAttemptId ===
        secondAttemptId,
    );
    // Same row updated in place, not a second one created.
    expect(updated.id).toBe(created.id);

    const allPlansForUser = await setupPrisma.learningPlan.findMany({
      where: { userId, languageId },
    });
    expect(allPlansForUser).toHaveLength(1);
  }, 20000);
});
