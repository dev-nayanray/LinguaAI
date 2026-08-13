import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DomainEventPublisher } from '@linguaai/events';

import { BillingService } from './billing.service.js';
import type { EntitlementCacheService } from './entitlement-cache.service.js';
import type { StripeClientService } from './stripe-client.service.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PREMIUM_PLAN_ID = '22222222-2222-2222-2222-222222222222';
const FREE_PLAN_ID = '33333333-3333-3333-3333-333333333333';

function fakePrisma() {
  return {
    plan: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    entitlement: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    entitlementChangeLog: { create: jest.fn() },
    invoice: { upsert: jest.fn() },
  };
}

function fakeStripeClient(): jest.Mocked<Pick<StripeClientService, 'createCheckoutSession'>> {
  return { createCheckoutSession: jest.fn() };
}

function fakeEvents(): jest.Mocked<Pick<DomainEventPublisher, 'publish'>> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function fakeLogger() {
  return { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

/** Always a cache miss + no-op writes -- these unit tests exercise real Postgres-resolution logic, not the cache layer itself (`entitlement-cache.service.spec.ts` covers that). */
function fakeCache(): jest.Mocked<Pick<EntitlementCacheService, 'get' | 'set' | 'invalidate'>> {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  stripeClient: ReturnType<typeof fakeStripeClient> = fakeStripeClient(),
  events: ReturnType<typeof fakeEvents> = fakeEvents(),
  logger: ReturnType<typeof fakeLogger> = fakeLogger(),
  cache: ReturnType<typeof fakeCache> = fakeCache(),
): BillingService {
  return new BillingService(
    prisma as never,
    // Same fake instance for both roles -- these unit tests don't
    // exercise the real RLS-driven appPrisma/servicePrisma split
    // (billing.e2e-spec.ts does, against real Postgres); each test's own
    // mocked methods work identically regardless of which constructor
    // slot they're read through.
    prisma as never,
    stripeClient as unknown as StripeClientService,
    events as unknown as DomainEventPublisher,
    cache as unknown as EntitlementCacheService,
    logger as never,
  );
}

describe('BillingService.createCheckoutSession', () => {
  it('creates a real Checkout Session for a configured PREMIUM plan', async () => {
    const prisma = fakePrisma();
    prisma.plan.findUnique.mockResolvedValue({
      id: PREMIUM_PLAN_ID,
      tier: 'PREMIUM',
      isActive: true,
      stripePriceId: 'price_123',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'learner@example.com' });
    prisma.subscription.findFirst.mockResolvedValue(null);
    const stripeClient = fakeStripeClient();
    stripeClient.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/abc',
    });
    const service = buildService(prisma, stripeClient);

    const result = await service.createCheckoutSession(USER_ID);

    expect(stripeClient.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price_123',
        userId: USER_ID,
        customerEmail: 'learner@example.com',
      }) as unknown,
    );
    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/abc' });
  });

  it('reuses an existing stripeCustomerId instead of a fresh email when the caller has a prior Subscription', async () => {
    const prisma = fakePrisma();
    prisma.plan.findUnique.mockResolvedValue({
      id: PREMIUM_PLAN_ID,
      tier: 'PREMIUM',
      isActive: true,
      stripePriceId: 'price_123',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'learner@example.com' });
    prisma.subscription.findFirst.mockResolvedValue({ stripeCustomerId: 'cus_existing' });
    const stripeClient = fakeStripeClient();
    stripeClient.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/abc',
    });
    const service = buildService(prisma, stripeClient);

    await service.createCheckoutSession(USER_ID);

    expect(stripeClient.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_existing', customerEmail: undefined }) as unknown,
    );
  });

  it('throws 404 when the caller does not exist', async () => {
    const prisma = fakePrisma();
    prisma.plan.findUnique.mockResolvedValue({
      id: PREMIUM_PLAN_ID,
      tier: 'PREMIUM',
      isActive: true,
      stripePriceId: 'price_123',
    });
    prisma.user.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(service.createCheckoutSession(USER_ID)).rejects.toThrow(NotFoundException);
  });

  it('throws 400 (a real, honest failure) when PREMIUM has no configured stripePriceId', async () => {
    const prisma = fakePrisma();
    prisma.plan.findUnique.mockResolvedValue({
      id: PREMIUM_PLAN_ID,
      tier: 'PREMIUM',
      isActive: true,
      stripePriceId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'learner@example.com' });
    const service = buildService(prisma);

    await expect(service.createCheckoutSession(USER_ID)).rejects.toThrow(BadRequestException);
  });

  it('throws 400 when PREMIUM is not active', async () => {
    const prisma = fakePrisma();
    prisma.plan.findUnique.mockResolvedValue({
      id: PREMIUM_PLAN_ID,
      tier: 'PREMIUM',
      isActive: false,
      stripePriceId: 'price_123',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'learner@example.com' });
    const service = buildService(prisma);

    await expect(service.createCheckoutSession(USER_ID)).rejects.toThrow(BadRequestException);
  });
});

describe('BillingService.getStatus', () => {
  it("returns the caller's own real Entitlement snapshot when one exists", async () => {
    const prisma = fakePrisma();
    prisma.entitlement.findUnique.mockResolvedValue({
      limits: { pronunciationLabAccess: true },
      usage: { aiConversationMinutesUsedToday: 5 },
      plan: { tier: 'PREMIUM' },
    });
    prisma.subscription.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      trialEndsAt: null,
    });
    const service = buildService(prisma);

    const result = await service.getStatus(USER_ID);

    expect(result).toEqual({
      planTier: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      trialEndsAt: null,
      limits: { pronunciationLabAccess: true },
      usage: { aiConversationMinutesUsedToday: 5 },
    });
  });

  it('falls back to the real FREE plan limits for a learner with no Entitlement row yet', async () => {
    const prisma = fakePrisma();
    prisma.entitlement.findUnique.mockResolvedValue(null);
    prisma.plan.findUniqueOrThrow.mockResolvedValue({
      id: FREE_PLAN_ID,
      tier: 'FREE',
      limits: { pronunciationLabAccess: false },
    });
    const service = buildService(prisma);

    const result = await service.getStatus(USER_ID);

    expect(result).toEqual({
      planTier: 'FREE',
      subscriptionStatus: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      limits: { pronunciationLabAccess: false },
      usage: {},
    });
  });
});

describe('BillingService.hasEntitlement', () => {
  it('reads via servicePrisma, not appPrisma (EntitlementGuard runs before RLS tenant context is set)', async () => {
    const appPrisma = fakePrisma();
    const servicePrisma = fakePrisma();
    servicePrisma.entitlement.findUnique.mockResolvedValue({
      limits: { pronunciationLabAccess: true },
      usage: {},
      plan: { tier: 'PREMIUM' },
    });
    const service = new BillingService(
      appPrisma as never,
      servicePrisma as never,
      fakeStripeClient() as unknown as StripeClientService,
      fakeEvents() as unknown as DomainEventPublisher,
      fakeCache() as unknown as EntitlementCacheService,
      fakeLogger() as never,
    );

    const result = await service.hasEntitlement(USER_ID, 'pronunciationLabAccess');

    expect(result).toBe(true);
    expect(servicePrisma.entitlement.findUnique).toHaveBeenCalled();
    expect(appPrisma.entitlement.findUnique).not.toHaveBeenCalled();
  });

  it('returns false when the key is present but not true', async () => {
    const prisma = fakePrisma();
    prisma.entitlement.findUnique.mockResolvedValue({
      limits: { pronunciationLabAccess: false },
      usage: {},
      plan: { tier: 'FREE' },
    });
    const service = buildService(prisma);

    expect(await service.hasEntitlement(USER_ID, 'pronunciationLabAccess')).toBe(false);
  });

  it('returns false when the key is absent from a FREE-plan fallback', async () => {
    const prisma = fakePrisma();
    prisma.entitlement.findUnique.mockResolvedValue(null);
    prisma.plan.findUniqueOrThrow.mockResolvedValue({
      id: FREE_PLAN_ID,
      tier: 'FREE',
      limits: {},
    });
    const service = buildService(prisma);

    expect(await service.hasEntitlement(USER_ID, 'pronunciationLabAccess')).toBe(false);
  });
});

describe('BillingService.handleWebhookEvent', () => {
  function subscriptionEvent(overrides: Record<string, unknown> = {}) {
    return {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: { userId: USER_ID },
          items: { data: [{ price: { id: 'price_123' }, current_period_end: 1900000000 }] },
          trial_end: null,
          ...overrides,
        },
      },
    };
  }

  it('creates a real Subscription + Entitlement on the first sync, and publishes both real billing events', async () => {
    const prisma = fakePrisma();
    const premiumPlan = {
      id: PREMIUM_PLAN_ID,
      tier: 'PREMIUM',
      limits: { pronunciationLabAccess: true },
    };
    prisma.plan.findFirst.mockResolvedValue(premiumPlan);
    prisma.plan.findUniqueOrThrow.mockResolvedValue(premiumPlan);
    prisma.subscription.findUnique.mockResolvedValue(null);
    const events = fakeEvents();
    const service = buildService(prisma, fakeStripeClient(), events);

    await service.handleWebhookEvent(subscriptionEvent() as never);

    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          planId: PREMIUM_PLAN_ID,
          status: 'ACTIVE',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
        }) as unknown,
      }),
    );
    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        update: { planId: PREMIUM_PLAN_ID, limits: { pronunciationLabAccess: true } },
      }),
    );
    expect(events.publish).toHaveBeenCalledWith('billing.entitlement.changed', {
      userId: USER_ID,
      payload: { userId: USER_ID, entitlementKey: 'planTier', newValue: 'PREMIUM' },
    });
    expect(events.publish).toHaveBeenCalledWith('billing.subscription.changed', {
      userId: USER_ID,
      payload: { userId: USER_ID, plan: 'PREMIUM', status: 'ACTIVE' },
    });
  });

  it('updates an existing Subscription row rather than creating a duplicate', async () => {
    const prisma = fakePrisma();
    const premiumPlan = { id: PREMIUM_PLAN_ID, tier: 'PREMIUM', limits: {} };
    prisma.plan.findFirst.mockResolvedValue(premiumPlan);
    prisma.plan.findUniqueOrThrow.mockResolvedValue(premiumPlan);
    prisma.subscription.findUnique.mockResolvedValue({ id: 'existing-row-id', canceledAt: null });
    const service = buildService(prisma);

    await service.handleWebhookEvent(subscriptionEvent() as never);

    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-row-id' } }),
    );
  });

  it('leaves the real Entitlement untouched for PAST_DUE (a real, deliberate grace period)', async () => {
    const prisma = fakePrisma();
    prisma.plan.findFirst.mockResolvedValue({ id: PREMIUM_PLAN_ID, tier: 'PREMIUM', limits: {} });
    prisma.subscription.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await service.handleWebhookEvent(subscriptionEvent({ status: 'past_due' }) as never);

    expect(prisma.entitlement.upsert).not.toHaveBeenCalled();
  });

  it('reverts Entitlement to the real FREE plan on cancellation', async () => {
    const prisma = fakePrisma();
    prisma.plan.findFirst.mockResolvedValue({ id: PREMIUM_PLAN_ID, tier: 'PREMIUM', limits: {} });
    prisma.plan.findUniqueOrThrow.mockResolvedValue({
      id: FREE_PLAN_ID,
      tier: 'FREE',
      limits: { pronunciationLabAccess: false },
    });
    prisma.subscription.findUnique.mockResolvedValue({ id: 'existing-row-id', canceledAt: null });
    const service = buildService(prisma);

    await service.handleWebhookEvent({
      type: 'customer.subscription.deleted',
      data: { object: subscriptionEvent().data.object },
    } as never);

    expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { planId: FREE_PLAN_ID, limits: { pronunciationLabAccess: false } },
      }),
    );
  });

  it('ignores (logs, never throws) a subscription webhook with no userId metadata', async () => {
    const prisma = fakePrisma();
    const logger = fakeLogger();
    const service = buildService(prisma, fakeStripeClient(), fakeEvents(), logger);

    await service.handleWebhookEvent(subscriptionEvent({ metadata: {} }) as never);

    expect(logger.warn).toHaveBeenCalled();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('ignores (logs, never throws) a subscription webhook for an unrecognized Price id', async () => {
    const prisma = fakePrisma();
    prisma.plan.findFirst.mockResolvedValue(null);
    const logger = fakeLogger();
    const service = buildService(prisma, fakeStripeClient(), fakeEvents(), logger);

    await service.handleWebhookEvent(subscriptionEvent() as never);

    expect(logger.warn).toHaveBeenCalled();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it('upserts a real Invoice row for a subscription-linked invoice event', async () => {
    const prisma = fakePrisma();
    prisma.subscription.findUnique.mockResolvedValue({ id: 'internal-sub-id' });
    const service = buildService(prisma);

    await service.handleWebhookEvent({
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_123',
          status: 'paid',
          amount_due: 1999,
          amount_paid: 1999,
          currency: 'usd',
          created: 1900000000,
          status_transitions: { paid_at: 1900000100 },
          parent: { subscription_details: { subscription: 'sub_123' } },
        },
      },
    } as never);

    expect(prisma.invoice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeInvoiceId: 'in_123' },
        create: expect.objectContaining({
          stripeInvoiceId: 'in_123',
          subscriptionId: 'internal-sub-id',
          status: 'PAID',
          amountDue: 1999,
          amountPaid: 1999,
        }) as unknown,
      }),
    );
  });

  it('ignores an invoice event with no linked Subscription', async () => {
    const prisma = fakePrisma();
    const service = buildService(prisma);

    await service.handleWebhookEvent({
      type: 'invoice.paid',
      data: { object: { id: 'in_123', parent: { subscription_details: null } } },
    } as never);

    expect(prisma.invoice.upsert).not.toHaveBeenCalled();
  });

  it('does not throw on an unrecognized/unhandled Stripe event type', async () => {
    const prisma = fakePrisma();
    const service = buildService(prisma);

    await expect(
      service.handleWebhookEvent({
        type: 'payment_method.attached',
        data: { object: {} },
      } as never),
    ).resolves.toBeUndefined();
  });
});
