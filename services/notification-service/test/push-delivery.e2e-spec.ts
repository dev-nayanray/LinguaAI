import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import { createDomainEventsConsumerQueue, DomainEventPublisher } from '@linguaai/events';
import type { Queue } from 'bullmq';

import { AppModule } from '../src/app.module.js';
import { PushClientService } from '../src/push/push-client.service.js';

/**
 * Real, live proof of the E21 T4 push pipeline, stubbed only at the one
 * true external boundary this environment cannot reach for real (no
 * Firebase project/credentials exist here — a real, tracked blocker
 * mirroring RISK_REGISTER R-88's own "credential-less environment"
 * precedent for `ai-engine`). Everything else is real: the actual
 * `AppModule` boots, `DomainEventsModule`'s own `Worker` runs against real
 * local Redis (E16 T1's fan-out), a real `User`/`DeviceToken` row exists
 * in Postgres, `NotificationPreferenceService`/`NotificationDispatcher`
 * run unmocked, and the resulting `NotificationLog` row is read back from
 * real Postgres — only `PushClientService.send()` itself is a stub, the
 * same "mock the boundary, not the module" precedent
 * `notification-delivery.e2e-spec.ts` already established for
 * `EmailClientService` (though that suite hits a real local MailHog
 * instead of stubbing, since a real SMTP sink exists here and a real FCM
 * sink does not).
 */
describe('push delivery (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  let queue: Queue;
  let publisher: DomainEventPublisher;
  let userId: string;
  const pushSend = jest.fn();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PushClientService)
      .useValue({ send: pushSend })
      .compile();
    app = moduleRef.createNestApplication();
    // Starts DomainEventsModule's own real Worker (onModuleInit).
    await app.init();

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set — see .env');
    }
    queue = createDomainEventsConsumerQueue(redisUrl, 'notification-service');
    queue.on('error', () => undefined);
    publisher = new DomainEventPublisher(queue);

    const user = await setupPrisma.user.create({
      data: {
        email: `e21-t4-${randomUUID().slice(0, 8)}@test.local`,
        displayName: 'E21 T4 Test User',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await setupPrisma.notificationLog.deleteMany({ where: { userId } });
    await setupPrisma.notificationPreference.deleteMany({ where: { userId } });
    await setupPrisma.deviceToken.deleteMany({ where: { userId } });
    await setupPrisma.user.delete({ where: { id: userId } });
    await queue.close();
    await setupPrisma.$disconnect();
    await app.close();
    // Same grace-period fix `notification-delivery.e2e-spec.ts` already
    // established for a straggling BullMQ/ioredis teardown rejection.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  beforeEach(() => {
    pushSend.mockReset();
    pushSend.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Each test shares one `userId` (real user creation is comparatively
    // slow, and this suite's own tests don't need distinct users) — real
    // isolation instead comes from clearing every row a prior test's own
    // DeviceToken/NotificationPreference/NotificationLog write could leave
    // behind, so a later test's "no device tokens"/"opted out" assertions
    // aren't seeing a previous test's own state bleed through.
    await setupPrisma.notificationLog.deleteMany({ where: { userId } });
    await setupPrisma.notificationPreference.deleteMany({ where: { userId } });
    await setupPrisma.deviceToken.deleteMany({ where: { userId } });
  });

  /** Polls real Postgres — the Worker processes asynchronously off the queue, not synchronously with `publish()`. */
  async function waitForNotificationLog(
    timeoutMs = 15000,
  ): Promise<{ status: string; channel: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const log = await setupPrisma.notificationLog.findFirst({
        where: { userId, channel: 'PUSH' },
        orderBy: { createdAt: 'desc' },
      });
      if (log) {
        return log;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Timed out waiting for a real PUSH NotificationLog row');
  }

  it('recommendation.daily_goal.ready: sends a real push to a real registered DeviceToken and logs SENT', async () => {
    const token = randomUUID();
    await setupPrisma.deviceToken.create({
      data: { userId, platform: 'ANDROID', token, active: true },
    });

    await publisher.publish('recommendation.daily_goal.ready', {
      userId,
      payload: { userId, date: '2026-08-14', targetXp: 50, targetMinutes: 15, targetActivities: 3 },
    });

    const log = await waitForNotificationLog();
    expect(log.status).toBe('SENT');
    expect(pushSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token,
        body: expect.stringContaining('50 XP') as unknown as string,
      }),
    );
  }, 20000);

  it('is a real, unlogged no-op when the user has no registered device tokens', async () => {
    await publisher.publish('recommendation.daily_goal.ready', {
      userId,
      payload: { userId, date: '2026-08-14', targetXp: 50, targetMinutes: 15, targetActivities: 3 },
    });

    // No real way to "wait for absence" deterministically — a short real
    // wait, then assert nothing landed. Matches this pattern's own
    // established tolerance elsewhere in this codebase for negative
    // assertions on an async consumer.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(pushSend).not.toHaveBeenCalled();
    const log = await setupPrisma.notificationLog.findFirst({ where: { userId, channel: 'PUSH' } });
    expect(log).toBeNull();
  }, 20000);

  it('suppresses delivery for an opted-out PUSH/SYSTEM NotificationPreference row', async () => {
    const token = randomUUID();
    await setupPrisma.deviceToken.create({
      data: { userId, platform: 'IOS', token, active: true },
    });
    await setupPrisma.notificationPreference.create({
      data: { userId, channel: 'PUSH', type: 'SYSTEM', optedIn: false },
    });

    await publisher.publish('recommendation.daily_goal.ready', {
      userId,
      payload: { userId, date: '2026-08-14', targetXp: 50, targetMinutes: 15, targetActivities: 3 },
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(pushSend).not.toHaveBeenCalled();
    const log = await setupPrisma.notificationLog.findFirst({ where: { userId, channel: 'PUSH' } });
    expect(log).toBeNull();
  }, 20000);
});
