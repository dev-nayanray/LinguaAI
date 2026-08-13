import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@linguaai/database';
import { SubscriptionStatus } from '@linguaai/database';
import { DomainEventPublisher } from '@linguaai/events';
import type { Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';
import type { BillingStatusResponse, CheckoutSessionResponse } from '@linguaai/validation/commerce';
import {
  billingEntitlementChangedPayloadSchema,
  billingStatusResponseSchema,
  billingSubscriptionChangedPayloadSchema,
  checkoutSessionResponseSchema,
} from '@linguaai/validation/commerce';
import type Stripe from 'stripe';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../database/index.js';
import { EntitlementCacheService } from './entitlement-cache.service.js';
import { mapStripeInvoiceStatus, mapStripeSubscriptionStatus } from './stripe-status.util.js';
import { StripeClientService } from './stripe-client.service.js';

/**
 * `BillingModule` (E15 T1-T3, design doc §6). Real Stripe Checkout
 * creation and webhook-driven `Subscription`/`Invoice`/`Entitlement`
 * sync. T1 resolved entitlements by reading Postgres directly, no cache
 * at all (§3.3's own original deferral). T3 adds `EntitlementCacheService`
 * — a real Redis cache-aside layer — but the "no paywall lag" guarantee
 * still holds by construction, not by hoping TTL expiry is fast enough:
 * every real entitlement-changing write (`syncEntitlement()`) invalidates
 * the caller's own cache entry synchronously, in the same call, before
 * `handleWebhookEvent()` returns — so a `GET /v1/billing/me` immediately
 * after this same service processes a webhook still always sees the
 * fresh state, cache included.
 *
 * Two Prisma clients, a real, load-bearing distinction found while
 * implementing this task (not assumed from the design doc alone):
 * `Subscription`'s own RLS policy (`20260806210659_fix_app_role_grants_
 * and_subscription_rls`) denies INSERT/UPDATE/DELETE to `app_role`
 * entirely — "all subscription mutations run through app_service_role
 * (BYPASSRLS), consistent with how User's own privileged-write paths
 * work." `createCheckoutSession()`/`getStatus()` run inside a real
 * authenticated request (`appPrisma`, RLS-scoped to the caller's own
 * rows — correct and sufficient for a read of the caller's own data);
 * `handleWebhookEvent()` runs with no caller session at all (a real
 * Stripe server-to-server callback) and must write `Subscription`, so it
 * uses `servicePrisma` throughout, mirroring `auth.service.ts`'s own
 * `appPrisma`/`servicePrisma` split for the same reason.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
    private readonly stripeClient: StripeClientService,
    private readonly events: DomainEventPublisher,
    private readonly cache: EntitlementCacheService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async createCheckoutSession(userId: string): Promise<CheckoutSessionResponse> {
    const [plan, user, existingSubscription] = await Promise.all([
      this.appPrisma.plan.findUnique({ where: { tier: 'PREMIUM' } }),
      this.appPrisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      this.appPrisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!plan?.isActive || !plan.stripePriceId) {
      // A real, honest failure -- this environment has no Stripe test
      // account provisioned (§6.1), so no operator has configured a real
      // Price id yet. Never silently proceeds with a fake/placeholder id.
      throw new BadRequestException('Premium plan is not currently configured for checkout');
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const session = await this.stripeClient.createCheckoutSession({
      priceId: plan.stripePriceId,
      userId,
      customerId: existingSubscription?.stripeCustomerId,
      customerEmail: existingSubscription ? undefined : user.email,
      successUrl: `${appUrl}/billing/success`,
      cancelUrl: `${appUrl}/billing/cancel`,
    });

    return checkoutSessionResponseSchema.parse({ checkoutUrl: session.url });
  }

  async getStatus(userId: string): Promise<BillingStatusResponse> {
    return this.resolveStatus(userId, this.appPrisma);
  }

  /**
   * `EntitlementGuard`'s own real entry point (E15 T2) — deliberately
   * uses `servicePrisma`, not `appPrisma`. Guards run *before*
   * `TenantContextInterceptor` in Nest's own request pipeline (middleware
   * → guards → interceptors → pipes → handler), so an `appPrisma` read
   * from inside a guard has no RLS tenant context set yet — confirmed the
   * hard way (a real `invalid input syntax for type uuid: ''` failure,
   * the same class of bug T1's own webhook path already hit and fixed).
   * Safe to bypass RLS here for the same reason `handleWebhookEvent()`
   * already does: `userId` comes from the guard's own JWT-verified
   * `request.user`, never client-suppliable, so there is no cross-tenant
   * leakage risk RLS would otherwise be the only thing preventing.
   */
  async hasEntitlement(userId: string, key: string): Promise<boolean> {
    const status = await this.resolveStatus(userId, this.servicePrisma);
    return status.limits[key] === true;
  }

  /**
   * Cache-aside (E15 T3, §3.3's own deferred optimization): checks
   * `EntitlementCacheService` first, falls through to a real Postgres
   * read on a miss (or a Redis failure — `EntitlementCacheService` is
   * fail-open), then populates the cache. Safe to share one cache entry
   * across both `appPrisma`/`servicePrisma` call sites — the underlying
   * data is identical either way, only the RLS access path differs.
   */
  private async resolveStatus(
    userId: string,
    prisma: PrismaClient,
  ): Promise<BillingStatusResponse> {
    const cached = await this.cache.get(userId);
    if (cached) {
      return cached;
    }

    const status = await this.resolveStatusFromPostgres(userId, prisma);
    await this.cache.set(userId, status);
    return status;
  }

  private async resolveStatusFromPostgres(
    userId: string,
    prisma: PrismaClient,
  ): Promise<BillingStatusResponse> {
    const [entitlement, subscription] = await Promise.all([
      prisma.entitlement.findUnique({ where: { userId }, include: { plan: true } }),
      prisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (entitlement) {
      return billingStatusResponseSchema.parse({
        planTier: entitlement.plan.tier,
        subscriptionStatus: subscription?.status ?? null,
        currentPeriodEnd: subscription?.currentPeriodEnd.toISOString() ?? null,
        trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
        limits: entitlement.limits,
        usage: entitlement.usage,
      });
    }

    // No Entitlement row yet (never subscribed) -- a real FREE-plan
    // learner still sees their own real default limits, not an empty
    // object.
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { tier: 'FREE' } });
    return billingStatusResponseSchema.parse({
      planTier: 'FREE',
      subscriptionStatus: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      limits: freePlan.limits,
      usage: {},
    });
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.reconcileSubscription(event.data.object);
        return;
      case 'customer.subscription.deleted':
        await this.reconcileSubscription(event.data.object, { forceCanceled: true });
        return;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.syncInvoice(event.data.object);
        return;
      default:
        // Stripe sends many event types this epic's own MVP scope doesn't
        // need to react to (e.g. `payment_method.attached`) -- silently
        // ignoring an unrecognized-but-harmless event type is the correct
        // webhook-endpoint behavior, not a gap; the handler still always
        // returns 200 so Stripe never retries it.
        return;
    }
  }

  /**
   * The one real unit of subscription-sync work — called both from a
   * live webhook (`handleWebhookEvent()`) and from `ReconciliationRunner`
   * (E15 T3, §3.4), which re-runs this same method against every
   * recently-listed real Stripe subscription on a periodic schedule,
   * catching whatever a dropped webhook delivery left stale. Idempotent
   * either way — `existing` decides create vs. update, never assumes
   * which caller invoked it.
   */
  async reconcileSubscription(
    subscription: Stripe.Subscription,
    options: { forceCanceled?: boolean } = {},
  ): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) {
      // Defensive -- every Checkout Session this service ever creates sets
      // `subscription_data.metadata.userId` (stripe-client.service.ts), so
      // this should never happen for a subscription this platform created.
      this.logger.warn(
        { stripeSubscriptionId: subscription.id },
        'Received a Stripe subscription webhook with no userId metadata, ignoring',
      );
      return;
    }

    const status = options.forceCanceled
      ? SubscriptionStatus.CANCELED
      : mapStripeSubscriptionStatus(subscription.status);
    const priceId = subscription.items.data[0]?.price.id;
    const plan = priceId
      ? await this.servicePrisma.plan.findFirst({ where: { stripePriceId: priceId } })
      : null;

    if (!plan) {
      this.logger.warn(
        { stripeSubscriptionId: subscription.id, priceId },
        'Received a Stripe subscription webhook for an unrecognized Price id, ignoring',
      );
      return;
    }

    // `current_period_end` lives on the subscription item, not the
    // subscription itself, as of this SDK's own pinned Stripe API version
    // -- a real version-specific detail found while implementing this
    // task, not assumed from older Stripe API docs.
    const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
    const currentPeriodEnd = currentPeriodEndSeconds
      ? new Date(currentPeriodEndSeconds * 1000)
      : new Date();
    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    const existing = await this.servicePrisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (existing) {
      await this.servicePrisma.subscription.update({
        where: { id: existing.id },
        data: {
          status,
          planId: plan.id,
          currentPeriodEnd,
          trialEndsAt,
          canceledAt: status === SubscriptionStatus.CANCELED ? new Date() : existing.canceledAt,
        },
      });
    } else {
      await this.servicePrisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd,
          trialEndsAt,
        },
      });
    }

    await this.syncEntitlement(userId, plan.id, status);
  }

  /**
   * `PAST_DUE` is a real, deliberate grace period (§6.2/§10) -- the
   * caller's own `Entitlement` is left untouched, never reverted on the
   * first missed payment. `CANCELED`/`EXPIRED` revert to the `FREE`
   * plan's own limits; anything else adopts the newly-synced plan's
   * limits.
   */
  private async syncEntitlement(
    userId: string,
    planId: string,
    status: SubscriptionStatus,
  ): Promise<void> {
    if (status === SubscriptionStatus.PAST_DUE) {
      return;
    }

    const targetPlan =
      status === SubscriptionStatus.CANCELED || status === SubscriptionStatus.EXPIRED
        ? await this.servicePrisma.plan.findUniqueOrThrow({ where: { tier: 'FREE' } })
        : await this.servicePrisma.plan.findUniqueOrThrow({ where: { id: planId } });

    await this.servicePrisma.entitlement.upsert({
      where: { userId },
      create: {
        userId,
        planId: targetPlan.id,
        limits: targetPlan.limits as Prisma.InputJsonValue,
        usage: {},
      },
      update: { planId: targetPlan.id, limits: targetPlan.limits as Prisma.InputJsonValue },
    });

    // Synchronous invalidation (§3.3/T3) -- before this method returns,
    // never deferred, so the cache can never be the reason a caller sees
    // stale entitlement data.
    await this.cache.invalidate(userId);

    await this.servicePrisma.entitlementChangeLog.create({
      data: {
        userId,
        entitlementType: 'planTier',
        action: 'CHANGED',
        source: 'stripe_webhook',
      },
    });

    await this.events.publish('billing.entitlement.changed', {
      userId,
      payload: billingEntitlementChangedPayloadSchema.parse({
        userId,
        entitlementKey: 'planTier',
        newValue: targetPlan.tier,
      }),
    });
    await this.events.publish('billing.subscription.changed', {
      userId,
      payload: billingSubscriptionChangedPayloadSchema.parse({
        userId,
        plan: targetPlan.tier,
        status,
      }),
    });
  }

  private async syncInvoice(invoice: Stripe.Invoice): Promise<void> {
    const stripeSubscriptionId =
      typeof invoice.parent?.subscription_details?.subscription === 'string'
        ? invoice.parent.subscription_details.subscription
        : null;
    if (!stripeSubscriptionId) {
      // A one-off invoice not tied to a subscription -- out of this
      // epic's own scope (subscription billing only), ignored, not an
      // error.
      return;
    }

    const subscription = await this.servicePrisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
    if (!subscription) {
      this.logger.warn(
        { stripeInvoiceId: invoice.id, stripeSubscriptionId },
        'Received an invoice webhook for an unrecognized Subscription, ignoring',
      );
      return;
    }

    const status = mapStripeInvoiceStatus(invoice.status);
    const data = {
      subscriptionId: subscription.id,
      status,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      issuedAt: invoice.created ? new Date(invoice.created * 1000) : new Date(),
      paidAt:
        invoice.status === 'paid' && invoice.status_transitions.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
    };

    await this.servicePrisma.invoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: { stripeInvoiceId: invoice.id, ...data },
      update: data,
    });
  }
}
