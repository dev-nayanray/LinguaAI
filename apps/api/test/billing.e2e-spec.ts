import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Stripe from 'stripe';

import { AppModule } from '../src/app.module.js';
import { StripeClientService } from '../src/modules/billing/stripe-client.service.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

const TEST_PRICE_ID = `price_e2e_${randomUUID().slice(0, 8)}`;
// Matches this environment's own .env (STRIPE_WEBHOOK_SECRET='') -- the
// same real value BillingModule's own config resolution reads, so a
// signature computed here with this exact secret is one the running
// app's own real, unstubbed `constructWebhookEvent()` genuinely verifies.
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

function signStripePayload(rawBody: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function subscriptionEventBody(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_${randomUUID()}`,
        customer: `cus_${randomUUID()}`,
        status: 'active',
        metadata: {},
        items: {
          data: [
            {
              price: { id: TEST_PRICE_ID },
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
        trial_end: null,
        ...overrides,
      },
    },
  });
}

/**
 * Real integration tests against live Postgres (E15 T1, design doc §6/§9).
 * `StripeClientService.createCheckoutSession` is stubbed (a real HTTP
 * call to Stripe's own API this test environment has no test account
 * for) -- mirroring `writing-submissions.e2e-spec.ts`'s own established
 * "mock the boundary, not the module" discipline. `constructWebhookEvent`
 * is deliberately left real/unstubbed (design doc §6.1) -- it's pure
 * local HMAC verification, and this suite's own most important evidence
 * bar is proving that verification actually rejects a tampered signature
 * and accepts a real one.
 */
describe('BillingController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createCheckoutSession = jest.fn();
  const realStripeForWebhooks = new Stripe('sk_test_placeholder');
  const stripeClientStub: Pick<
    StripeClientService,
    'createCheckoutSession' | 'constructWebhookEvent' | 'listRecentSubscriptions'
  > = {
    createCheckoutSession,
    constructWebhookEvent: (rawBody, signature) =>
      realStripeForWebhooks.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET),
    // BillingModule's own real reconciliation Worker (E15 T3) runs inside
    // *every* app instance this suite boots -- a real, found cross-cutting
    // effect: an incomplete stub here previously crashed with
    // "listRecentSubscriptions is not a function" if the repeatable job's
    // own cron happened to land while this suite's app was still up. An
    // empty result is the real, correct "nothing to reconcile" behavior
    // for a stub that was never given any subscriptions to know about.
    listRecentSubscriptions: jest.fn().mockResolvedValue([]),
  };

  let originalPremiumStripePriceId: string | null = null;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StripeClientService)
      .useValue(stripeClientStub)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();

    await setupPrisma.plan.upsert({
      where: { tier: 'FREE' },
      create: {
        tier: 'FREE',
        name: 'Free',
        limits: { maxLanguages: 1, pronunciationLabAccess: false },
        isActive: true,
      },
      update: {},
    });

    const existingPremium = await setupPrisma.plan.findUnique({ where: { tier: 'PREMIUM' } });
    originalPremiumStripePriceId = existingPremium?.stripePriceId ?? null;
    await setupPrisma.plan.upsert({
      where: { tier: 'PREMIUM' },
      create: {
        tier: 'PREMIUM',
        name: 'Premium',
        limits: { maxLanguages: null, pronunciationLabAccess: true },
        isActive: true,
        stripePriceId: TEST_PRICE_ID,
      },
      update: { stripePriceId: TEST_PRICE_ID, isActive: true },
    });
  });

  afterEach(() => {
    createCheckoutSession.mockReset();
  });

  afterAll(async () => {
    await setupPrisma.plan.update({
      where: { tier: 'PREMIUM' },
      data: { stripePriceId: originalPremiumStripePriceId },
    });
    await setupPrisma.entitlementChangeLog.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.invoice.deleteMany({
      where: { subscription: { userId: { in: createdUserIds } } },
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
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  it('rejects an unauthenticated checkout request with 401', async () => {
    const res = await request(app.getHttpServer()).post('/v1/billing/checkout');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated GET /v1/billing/me with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/billing/me');
    expect(res.status).toBe(401);
  });

  it('returns the real FREE plan limits for a learner with no Entitlement yet', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .get('/v1/billing/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      planTier: 'FREE',
      subscriptionStatus: null,
      limits: { pronunciationLabAccess: false },
    });
  });

  it('creates a real Checkout Session referencing the real, configured Premium Price id', async () => {
    createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' });
    const learner = await freshSession();
    // Re-affirmed immediately before the real request, not just in
    // `beforeAll` -- `Plan.tier` is a real, globally-unique singleton
    // other e2e spec files (e.g. `billing-reconciliation.e2e-spec.ts`)
    // also legitimately configure for their own purposes, so a narrow,
    // concurrent multi-file test invocation can otherwise race this
    // value between this suite's own `beforeAll` and this specific
    // assertion (found the hard way running these two files together).
    await setupPrisma.plan.update({
      where: { tier: 'PREMIUM' },
      data: { stripePriceId: TEST_PRICE_ID },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/billing/checkout')
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ checkoutUrl: 'https://checkout.stripe.com/test-session' });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: TEST_PRICE_ID, userId: learner.userId }),
    );
  });

  it('rejects Checkout Session creation with 400 when Premium has no configured Price id', async () => {
    await setupPrisma.plan.update({ where: { tier: 'PREMIUM' }, data: { stripePriceId: null } });
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/billing/checkout')
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(400);

    await setupPrisma.plan.update({
      where: { tier: 'PREMIUM' },
      data: { stripePriceId: TEST_PRICE_ID },
    });
  });

  it('rejects a webhook request with a tampered signature with 400, and makes no database change', async () => {
    const learner = await freshSession();
    const rawBody = subscriptionEventBody({ metadata: { userId: learner.userId } });

    const res = await request(app.getHttpServer())
      .post('/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set(
        'stripe-signature',
        't=1,v1=0000000000000000000000000000000000000000000000000000000000000000',
      )
      .send(rawBody);

    expect(res.status).toBe(400);
    const subscription = await setupPrisma.subscription.findFirst({
      where: { userId: learner.userId },
    });
    expect(subscription).toBeNull();
  });

  it("a real, correctly-signed webhook synchronously syncs Entitlement to PREMIUM, immediately visible on the same-flow GET /v1/billing/me (§3.3's own 'no paywall lag' proof)", async () => {
    const learner = await freshSession();
    const rawBody = subscriptionEventBody({ metadata: { userId: learner.userId } });
    const signature = signStripePayload(rawBody);

    const webhookRes = await request(app.getHttpServer())
      .post('/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(rawBody);
    expect(webhookRes.status).toBe(201);

    const statusRes = await request(app.getHttpServer())
      .get('/v1/billing/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(statusRes.body).toMatchObject({
      planTier: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      limits: { pronunciationLabAccess: true },
    });
  });

  it('a real cancellation webhook reverts Entitlement back to FREE, synchronously', async () => {
    const learner = await freshSession();
    const stripeSubscriptionId = `sub_${randomUUID()}`;
    const activateBody = subscriptionEventBody({
      id: stripeSubscriptionId,
      metadata: { userId: learner.userId },
    });
    await request(app.getHttpServer())
      .post('/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signStripePayload(activateBody))
      .send(activateBody);

    const cancelBody = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: stripeSubscriptionId,
          customer: `cus_${randomUUID()}`,
          status: 'canceled',
          metadata: { userId: learner.userId },
          items: { data: [{ price: { id: TEST_PRICE_ID }, current_period_end: 0 }] },
          trial_end: null,
        },
      },
    });
    const cancelRes = await request(app.getHttpServer())
      .post('/v1/billing/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signStripePayload(cancelBody))
      .send(cancelBody);
    expect(cancelRes.status).toBe(201);

    const statusRes = await request(app.getHttpServer())
      .get('/v1/billing/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(statusRes.body).toMatchObject({
      planTier: 'FREE',
      limits: { pronunciationLabAccess: false },
    });
  });
});
