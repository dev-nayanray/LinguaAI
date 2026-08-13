import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { BILLING_CONFIG, resolveBillingConfig } from './billing.config.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { EntitlementGuard } from './entitlement.guard.js';
import { StripeClientService } from './stripe-client.service.js';

/**
 * `BillingModule` (E15 T1/T2). `AuthModule` is imported only for
 * `AuthGuard('jwt')`'s own strategy provider, the same pattern every other
 * learner-facing module (Gamification, Pronunciation, ...) already
 * follows. `EntitlementGuard` is exported (not just `BillingService`) so
 * other feature modules (`PronunciationModule`, T2) can import
 * `BillingModule` and use `@RequireEntitlement(...)` on their own
 * controllers without duplicating entitlement-resolution logic.
 */
@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    { provide: BILLING_CONFIG, useFactory: () => resolveBillingConfig() },
    StripeClientService,
    BillingService,
    EntitlementGuard,
  ],
  exports: [BillingService, EntitlementGuard],
})
export class BillingModule {}
