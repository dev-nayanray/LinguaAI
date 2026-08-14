import { SubscriptionStatus, InvoiceStatus } from '@linguaai/database';
import type Stripe from 'stripe';

/**
 * Maps Stripe's own subscription status strings onto the platform's
 * smaller `SubscriptionStatus` enum (E15 T1, design doc §6.2).
 * `unpaid`/`paused` fold into `PAST_DUE` (still a grace period from this
 * platform's own perspective — Stripe's dunning/retry cycle is what
 * eventually resolves to `canceled`); `incomplete`/`incomplete_expired`
 * (a subscription that never successfully started) fold into `EXPIRED`.
 * Never throws on an unrecognized future Stripe status — defensively
 * defaults to `PAST_DUE` (the least destructive fallback: it never
 * silently elevates or revokes access) rather than crashing webhook
 * processing over a Stripe API addition this platform hasn't mapped yet.
 */
export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELED;
    case 'incomplete':
    case 'incomplete_expired':
      return SubscriptionStatus.EXPIRED;
    default:
      return SubscriptionStatus.PAST_DUE;
  }
}

export function mapStripeInvoiceStatus(status: Stripe.Invoice.Status | null): InvoiceStatus {
  switch (status) {
    case 'draft':
      return InvoiceStatus.DRAFT;
    case 'open':
      return InvoiceStatus.OPEN;
    case 'paid':
      return InvoiceStatus.PAID;
    case 'void':
      return InvoiceStatus.VOID;
    case 'uncollectible':
      return InvoiceStatus.UNCOLLECTIBLE;
    default:
      return InvoiceStatus.OPEN;
  }
}
