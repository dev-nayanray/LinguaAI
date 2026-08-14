import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import { createDomainEventsConsumerQueue, DomainEventPublisher } from '@linguaai/events';
import type { Queue } from 'bullmq';

import { AppModule } from '../src/app.module.js';
import { assertNoEmail, clearMailhogInbox, waitForEmail } from './helpers/mailhog.js';

/**
 * Real, live proof of the whole E16 T2 pipeline (design doc's own evidence
 * bar: "a real e2e test proving an actual email lands in MailHog for a
 * real registered user, and is suppressed for an opted-out preference
 * row") — not a mocked substitute. Boots the real `AppModule` (starting
 * `DomainEventsModule`'s own real `Worker` against the real local Redis,
 * on this consumer's own `domain-events-notification-service` queue, E16
 * T1), publishes real events via the same `DomainEventPublisher`/
 * `createDomainEventsConsumerQueue` `recommendation-engine`'s own e2e
 * suite uses, and asserts a real email actually arrived in the real local
 * `mailhog` container (`docker-compose.yml`) — not just that `nodemailer`
 * was called.
 */
describe('notification delivery (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  let queue: Queue;
  let publisher: DomainEventPublisher;
  let userId: string;
  let userEmail: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Starts DomainEventsModule's own real Worker (onModuleInit).
    await app.init();

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set — see .env');
    }
    queue = createDomainEventsConsumerQueue(redisUrl, 'notification-service');
    // `Queue` is an `EventEmitter` — an unlistened `'error'` event throws
    // unhandled in Node, the same real bug `DailyGoalModule`'s own doc
    // comment explains.
    queue.on('error', () => undefined);
    publisher = new DomainEventPublisher(queue);

    userEmail = `e16-t2-${randomUUID().slice(0, 8)}@test.local`;
    const user = await setupPrisma.user.create({
      data: {
        email: userEmail,
        displayName: 'E16 T2 Test User',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await setupPrisma.notificationLog.deleteMany({ where: { userId } });
    await setupPrisma.notificationPreference.deleteMany({ where: { userId } });
    await setupPrisma.user.delete({ where: { id: userId } });
    await queue.close();
    await setupPrisma.$disconnect();
    await app.close();
    // Grace period for a straggling BullMQ/ioredis teardown rejection to
    // settle here rather than landing on whichever e2e spec file Jest
    // runs next in the same `--runInBand` process — same fix
    // `recommendation-engine`'s own e2e suites already established.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  /** Polls real Postgres for up to `timeoutMs` — the Worker processes asynchronously off the queue, not synchronously with `publish()`. */
  async function waitForNotificationLog(
    type: 'SYSTEM' | 'SECURITY_ALERT',
    timeoutMs = 10000,
  ): Promise<{ status: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const log = await setupPrisma.notificationLog.findFirst({
        where: { userId, type },
        orderBy: { createdAt: 'desc' },
      });
      if (log) {
        return log;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for a real NotificationLog row (type ${type})`);
  }

  beforeEach(async () => {
    await clearMailhogInbox();
  });

  it('identity.user.registered: sends a real welcome email that actually lands in MailHog, and logs SENT', async () => {
    await publisher.publish('identity.user.registered', {
      userId,
      payload: { signupSource: 'password' },
    });

    const email = await waitForEmail(userEmail);
    expect(email.subject).toContain('Welcome');

    const log = await waitForNotificationLog('SYSTEM');
    expect(log.status).toBe('SENT');
  }, 20000);

  it('identity.password.reset_requested: sends a real email containing a working reset link built from the raw token, and logs SENT', async () => {
    const rawToken = randomUUID();
    await publisher.publish('identity.password.reset_requested', {
      userId,
      payload: { resetTokenReference: randomUUID(), resetToken: rawToken },
    });

    const email = await waitForEmail(userEmail);
    // MailHog's raw MIME body is quoted-printable encoded (soft line
    // breaks, `=3D` for `=`) — asserting on the full
    // `/password-reset/confirm?token=<token>` substring is unreliable
    // since a soft break can land inside it. The raw token itself (a
    // UUID, short enough not to get wrapped) and its `password-reset`
    // path segment surviving intact is sufficient real proof the link was
    // built from this exact raw token, not a stand-in.
    expect(email.body).toContain('password-reset');
    expect(email.body).toContain(rawToken);

    const log = await waitForNotificationLog('SECURITY_ALERT');
    expect(log.status).toBe('SENT');
  }, 20000);

  it('suppresses delivery for an opted-out NotificationPreference row — no email, no NEW NotificationLog row', async () => {
    // A prior test in this file already sent a real SYSTEM email for this
    // same user — clearing its own NotificationLog row first so this
    // test's own "no row was written" assertion isn't checking against
    // that unrelated, already-sent one.
    await setupPrisma.notificationLog.deleteMany({ where: { userId, type: 'SYSTEM' } });
    await setupPrisma.notificationPreference.create({
      data: { userId, channel: 'EMAIL', type: 'SYSTEM', optedIn: false },
    });

    await publisher.publish('identity.user.registered', {
      userId,
      payload: { signupSource: 'password' },
    });

    await assertNoEmail(userEmail);

    const log = await setupPrisma.notificationLog.findFirst({ where: { userId, type: 'SYSTEM' } });
    expect(log).toBeNull();
  }, 20000);
});
