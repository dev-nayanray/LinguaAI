import { InvoiceStatus, SubscriptionStatus } from '@linguaai/database';

import { mapStripeInvoiceStatus, mapStripeSubscriptionStatus } from './stripe-status.util.js';

describe('mapStripeSubscriptionStatus', () => {
  it.each([
    ['trialing', SubscriptionStatus.TRIALING],
    ['active', SubscriptionStatus.ACTIVE],
    ['past_due', SubscriptionStatus.PAST_DUE],
    ['unpaid', SubscriptionStatus.PAST_DUE],
    ['paused', SubscriptionStatus.PAST_DUE],
    ['canceled', SubscriptionStatus.CANCELED],
    ['incomplete', SubscriptionStatus.EXPIRED],
    ['incomplete_expired', SubscriptionStatus.EXPIRED],
  ] as const)('maps Stripe status %s to %s', (stripeStatus, expected) => {
    expect(mapStripeSubscriptionStatus(stripeStatus)).toBe(expected);
  });

  it('defaults to PAST_DUE (never throws) for an unrecognized future Stripe status', () => {
    expect(mapStripeSubscriptionStatus('some_future_status' as never)).toBe(
      SubscriptionStatus.PAST_DUE,
    );
  });
});

describe('mapStripeInvoiceStatus', () => {
  it.each([
    ['draft', InvoiceStatus.DRAFT],
    ['open', InvoiceStatus.OPEN],
    ['paid', InvoiceStatus.PAID],
    ['void', InvoiceStatus.VOID],
    ['uncollectible', InvoiceStatus.UNCOLLECTIBLE],
  ] as const)('maps Stripe invoice status %s to %s', (stripeStatus, expected) => {
    expect(mapStripeInvoiceStatus(stripeStatus)).toBe(expected);
  });

  it('defaults to OPEN for a null status', () => {
    expect(mapStripeInvoiceStatus(null)).toBe(InvoiceStatus.OPEN);
  });
});
