import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';

import { BillingService } from './billing.service.js';
import { StripeClientService } from './stripe-client.service.js';

/**
 * The real per-run batch (E15 T3, §3.4) — kept outside `*.module.ts` on
 * purpose, mirroring `DailyGoalBatchRunner`'s own precedent (module files
 * are exempt from this repo's coverage requirement). Re-runs
 * `BillingService.reconcileSubscription()` — the exact same idempotent
 * sync logic a live webhook already uses — against every recently-listed
 * real Stripe subscription, catching whatever a dropped webhook delivery
 * left stale in Postgres. A single subscription failing to reconcile
 * (e.g. an unrecognized Price id, already logged as a warning inside
 * `reconcileSubscription()` itself) never aborts the rest of the batch.
 */
@Injectable()
export class ReconciliationRunner {
  constructor(
    private readonly stripeClient: StripeClientService,
    private readonly billing: BillingService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    const subscriptions = await this.stripeClient.listRecentSubscriptions();
    this.logger.info({ count: subscriptions.length }, 'Billing reconciliation run starting');

    let failures = 0;
    for (const subscription of subscriptions) {
      try {
        await this.billing.reconcileSubscription(subscription);
      } catch (err) {
        failures += 1;
        this.logger.error(
          { err, stripeSubscriptionId: subscription.id },
          'Billing reconciliation failed for one subscription, continuing with the rest of the batch',
        );
      }
    }

    this.logger.info(
      { count: subscriptions.length, failures },
      'Billing reconciliation run completed',
    );
  }
}
