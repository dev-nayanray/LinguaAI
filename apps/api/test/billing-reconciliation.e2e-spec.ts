import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient, type Subscription } from '@linguaai/database';
import cookieParser from 'cookie-parser';

import { AppModule } from '../src/app.module.js';
import { RECONCILIATION_JOB_NAME } from '../src/modules/billing/reconciliation.constants.js';
import { createReconciliationQueue } from '../src/modules/billing/reconciliation.queue.js';
import { StripeClientService } from '../src/modules/billing/stripe-client.service.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

const TEST_PRICE_ID = `price_reconcile_${randomUUID().slice(0, 8)}`;

/**
 * Real, live proof of the whole reconciliation-job pipeline (E15 T3's own
 * evidence bar: "a real test proving a simulated missed webhook is
 * caught and corrected by the reconciliation pass") — mirrors
 * `recommendation-engine`'s own `daily-goal-job.e2e-spec.ts` exactly:
 * boots the real `AppModule` (starting `BillingModule`'s own real
 * `Worker`), enqueues a real one-off job on the real
 * `billing-reconciliation` queue (bypassing the registered repeatable
 * job's own 15-minute cron schedule), and asserts a real `Subscription`/
 * `Entitlement` row lands in real Postgres for a Stripe subscription
 * this suite's own stubbed `listRecentSubscriptions()` returns —
 * simulating exactly the scenario this job exists for: a subscription
 * Stripe already knows about that a dropped webhook never told Postgres.
 * `StripeClientService` is stubbed entirely (a real HTTP call to Stripe's
 * own API this test environment has no test account for), the same
 * "mock the boundary, not the module" precedent `billing.e2e-spec.ts`
 * already established.
 */
describe('Billing reconciliation job (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const listRecentSubscriptions = jest.fn();
  const stripeClientStub: Pick<StripeClientService, 'listRecentSubscriptions'> = {
    listRecentSubscriptions,
  };
  let originalPremiumStripePriceId: string | null = null;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StripeClientService)
      .useValue(stripeClientStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    // Starts BillingModule's own real reconciliation Worker (onModuleInit).
    await app.init();

    const existingPremium = await setupPrisma.plan.findUnique({ where: { tier: 'PREMIUM' } });
    originalPremiumStripePriceId = existingPremium?.stripePriceId ?? null;
    await setupPrisma.plan.upsert({
      where: { tier: 'PREMIUM' },
      create: {
        tier: 'PREMIUM',
        name: 'Premium',
        limits: { pronunciationLabAccess: true },
        isActive: true,
        stripePriceId: TEST_PRICE_ID,
      },
      update: { stripePriceId: TEST_PRICE_ID, isActive: true },
    });
  });

  afterAll(async () => {
    await setupPrisma.plan.update({
      where: { tier: 'PREMIUM' },
      data: { stripePriceId: originalPremiumStripePriceId },
    });
    await setupPrisma.entitlementChangeLog.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.entitlement.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    if (app) {
      await app.close();
    }
    // Same real BullMQ/ioredis teardown race `daily-goal-job.e2e-spec.ts`'s
    // own doc comment already documents -- a short grace period so a
    // straggling connection-close rejection settles here, not on a
    // neighboring e2e file.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  /** Polls real Postgres -- the Worker processes asynchronously off the queue, not synchronously with `queue.add()`. */
  async function waitForSubscription(
    stripeSubscriptionId: string,
    timeoutMs = 10000,
  ): Promise<Subscription> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const subscription = await setupPrisma.subscription.findUnique({
        where: { stripeSubscriptionId },
      });
      if (subscription) {
        return subscription;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Timed out waiting for the real Worker to process the reconciliation job');
  }

  it('a real job execution catches a Stripe subscription no webhook ever told Postgres about, and syncs a real Entitlement', async () => {
    const learner = await freshSession();
    const stripeSubscriptionId = `sub_reconcile_${randomUUID()}`;
    const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    listRecentSubscriptions.mockResolvedValue([
      {
        id: stripeSubscriptionId,
        customer: `cus_reconcile_${randomUUID()}`,
        status: 'active',
        metadata: { userId: learner.userId },
        items: { data: [{ price: { id: TEST_PRICE_ID }, current_period_end: currentPeriodEnd }] },
        trial_end: null,
      },
    ]);

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set — see .env');
    }
    const queue = createReconciliationQueue(redisUrl);
    // `Queue` is an `EventEmitter` -- an unlistened `'error'` event throws
    // unhandled in Node (the same real bug `DailyGoalModule`'s own doc
    // comment already explains, found while building this exact test).
    queue.on('error', () => undefined);
    try {
      // A real, immediate one-off job -- the same queue/job name the
      // registered repeatable job uses, triggering the already-running
      // real Worker without waiting for its own 15-minute cron schedule.
      await queue.add(RECONCILIATION_JOB_NAME, {});

      const subscription = await waitForSubscription(stripeSubscriptionId);
      expect(subscription.userId).toBe(learner.userId);
      expect(subscription.status).toBe('ACTIVE');

      const entitlement = await setupPrisma.entitlement.findUnique({
        where: { userId: learner.userId },
        include: { plan: true },
      });
      expect(entitlement?.plan.tier).toBe('PREMIUM');
      expect(entitlement?.limits).toMatchObject({ pronunciationLabAccess: true });
    } finally {
      await queue.close();
    }
  }, 15000);
});
