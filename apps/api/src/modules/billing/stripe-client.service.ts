import { Inject, Injectable } from '@nestjs/common';
import type { BillingEnv } from '@linguaai/config';
import Stripe from 'stripe';

import { BILLING_CONFIG } from './billing.config.js';

export interface CreateCheckoutSessionParams {
  priceId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  /** Reuse an existing Stripe Customer if the caller already has one (a prior subscription, even a canceled one) — avoids creating a duplicate Customer per re-subscribe. */
  customerId?: string;
  /** Only used when `customerId` is absent — Stripe creates a new Customer from this email. */
  customerEmail?: string;
  trialPeriodDays?: number;
}

/**
 * Thin wrapper around the `stripe` SDK (E15 T1, design doc §6.1) — the
 * real external-API boundary, deliberately isolated behind its own
 * `Injectable` so e2e tests can `overrideProvider(StripeClientService)`
 * entirely, the same "mock the boundary, not the module" precedent
 * `AiEngineClientService`/`writing-submissions.e2e-spec.ts` already
 * established (E13). `constructWebhookEvent()` is the one exception worth
 * calling out — it's pure local HMAC verification (no live API call), so
 * real webhook e2e tests exercise it for real, unmocked, against a real
 * signature computed with the same test webhook secret.
 */
@Injectable()
export class StripeClientService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(@Inject(BILLING_CONFIG) config: BillingEnv) {
    // The Stripe SDK's own constructor throws synchronously ("Neither
    // apiKey nor config.authenticator provided") on an empty string --
    // confirmed the hard way, breaking every e2e suite's own `app.init()`
    // in this environment (no real key configured, §6.1's own intent is
    // that the app still boots). A placeholder keeps construction
    // succeeding; a real, unstubbed call with this placeholder would
    // still correctly fail with a real 401 from Stripe's own API, never
    // silently "succeed."
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY || 'sk_test_not_configured');
    this.webhookSecret = config.STRIPE_WEBHOOK_SECRET;
  }

  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      customer: params.customerId,
      customer_email: params.customerId ? undefined : params.customerEmail,
      subscription_data: {
        metadata: { userId: params.userId },
        ...(params.trialPeriodDays ? { trial_period_days: params.trialPeriodDays } : {}),
      },
    });

    if (!session.url) {
      throw new Error('Stripe Checkout Session was created without a redirect URL');
    }
    return { url: session.url };
  }

  /** Throws `Stripe.errors.StripeSignatureVerificationError` on a tampered or invalid signature — the caller (BillingController) turns that into a 400. */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
