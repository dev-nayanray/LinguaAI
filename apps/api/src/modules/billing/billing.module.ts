import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { BILLING_CONFIG, resolveBillingConfig } from './billing.config.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { StripeClientService } from './stripe-client.service.js';

/**
 * `BillingModule` (E15 T1). `AuthModule` is imported only for
 * `AuthGuard('jwt')`'s own strategy provider, the same pattern every other
 * learner-facing module (Gamification, Pronunciation, ...) already
 * follows.
 */
@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    { provide: BILLING_CONFIG, useFactory: () => resolveBillingConfig() },
    StripeClientService,
    BillingService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
