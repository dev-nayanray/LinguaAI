import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient, type LearningEvent } from '@linguaai/database';
import { createDomainEventsConsumerQueue, DomainEventPublisher } from '@linguaai/events';
import type { Queue } from 'bullmq';

import { AppModule } from '../src/app.module.js';

/**
 * Real, live proof of E17 T1's own evidence bar (design doc §9): "a real
 * e2e test proving a published event of an arbitrary, previously-unhandled
 * type ... lands as a real `LearningEvent` row, and a duplicate redelivery
 * of the same `eventId` does not create a second row." Boots the real
 * `AppModule` (starting `DomainEventsModule`'s own real `Worker` against
 * the real local Redis, on this consumer's own `domain-events-analytics-service`
 * queue, E16 T1), publishes real events via the same
 * `DomainEventPublisher`/`createDomainEventsConsumerQueue`
 * `notification-service`'s own e2e suite uses, and asserts against real
 * rows in the real local Postgres — not a mocked substitute.
 */
describe('analytics event ingestion (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  let queue: Queue;
  let publisher: DomainEventPublisher;
  let userId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set — see .env');
    }
    queue = createDomainEventsConsumerQueue(redisUrl, 'analytics-service');
    queue.on('error', () => undefined);
    publisher = new DomainEventPublisher(queue);

    // Real bug found while building this test: `LearningEvent.userId`,
    // though nullable, carries a real FK constraint to `User(id)` when
    // non-null — a random UUID with no backing `User` row fails the
    // insert with a real FK violation, not a soft/optional reference.
    // Every real domain event's own `userId` always names a real,
    // already-authenticated user, so this is correct schema behavior,
    // not a bug in the ingestion consumer — the test needed a real user.
    const user = await setupPrisma.user.create({
      data: {
        email: `e17-t1-${randomUUID().slice(0, 8)}@test.local`,
        displayName: 'E17 T1 Test User',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await setupPrisma.learningEvent.deleteMany({ where: { userId } });
    await setupPrisma.user.delete({ where: { id: userId } });
    await queue.close();
    await setupPrisma.$disconnect();
    await app.close();
    // Grace period for a straggling BullMQ/ioredis teardown rejection to
    // settle here rather than landing on whichever e2e spec file Jest
    // runs next — same fix `recommendation-engine`'s/`notification-service`'s
    // own e2e suites already established.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  /** Polls real Postgres for up to `timeoutMs` — the Worker processes asynchronously off the queue, not synchronously with `publish()`. */
  async function waitForLearningEvent(eventId: string, timeoutMs = 10000): Promise<LearningEvent> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await setupPrisma.learningEvent.findFirst({ where: { eventId } });
      if (row) {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for a real LearningEvent row (eventId ${eventId})`);
  }

  it('persists a real event of an arbitrary, previously-unhandled type as a real LearningEvent row — generic ingestion, no per-type dispatch', async () => {
    await publisher.publish('community.content.reported', {
      userId,
      payload: { reportId: randomUUID(), targetType: 'POST', targetId: randomUUID() },
    });

    // `DomainEventPublisher.publish()` generates `eventId` internally
    // (`randomUUID()`, not caller-supplied) — the real job it enqueued is
    // found here by `userId` instead, then its own `eventId` is what this
    // test polls Postgres for.
    const jobs = await queue.getJobs(['waiting', 'active', 'completed']);
    const job = jobs.find((j) => j.data.userId === userId);
    expect(job).toBeDefined();
    const row = await waitForLearningEvent(job!.data.eventId as string);
    expect(row.type).toBe('community.content.reported');
    expect(row.userId).toBe(userId);
    expect(row.producedBy).toBe('apps/api');

    await setupPrisma.learningEvent.deleteMany({ where: { eventId: row.eventId } });
  }, 20000);

  it('a duplicate redelivery of the same eventId does not create a second row', async () => {
    const eventId = randomUUID();
    const envelope = {
      eventId,
      type: 'gamification.xp.awarded',
      version: 1,
      occurredAt: new Date().toISOString(),
      producedBy: 'apps/api',
      tenantId: null,
      userId,
      payload: { amount: 10, reason: 'lesson_completed' },
    };

    // Two real, independent deliveries of the exact same eventId — the
    // real redelivery scenario BullMQ's own at-least-once guarantee
    // produces (EVENT_ARCHITECTURE.md §4), not a synthetic duplicate.
    await queue.add(envelope.type, envelope);
    await queue.add(envelope.type, envelope);

    await waitForLearningEvent(eventId);
    // A fixed settle window for the second delivery to have been
    // processed (or correctly no-op'd) — not a poll-until-found check,
    // since the assertion here is about the row count staying at 1.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const rows = await setupPrisma.learningEvent.findMany({ where: { eventId } });
    expect(rows).toHaveLength(1);

    await setupPrisma.learningEvent.deleteMany({ where: { eventId } });
  }, 20000);
});
