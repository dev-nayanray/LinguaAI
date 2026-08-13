import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { BillingModule } from '../billing/index.js';
import { SpeechServiceClientModule } from '../speech-service-client/speech-service-client.module.js';
import { PronunciationLabController } from './pronunciation-lab.controller.js';
import { PronunciationLabService } from './pronunciation-lab.service.js';

/**
 * `PronunciationModule` (E11 T2, entitlement-gated as of E15 T2). Imports
 * `AuthModule` for `AuthGuard('jwt')` (`SpeakingModule`'s own precedent),
 * `SpeechServiceClientModule` — `PronunciationLabService`'s real, first
 * consumer of `SpeechServiceClientService` — and `BillingModule`, whose
 * `EntitlementGuard` this module's own controller now uses
 * (`@RequireEntitlement('pronunciationLabAccess')`), closing
 * RISK_REGISTER's own already-tracked entitlement-enforcement gap.
 * `DomainEventPublisher` needs no explicit import — `EventsModule` is
 * `@Global()`, the same precedent `SpeakingModule`/`AssessmentModule`
 * already rely on.
 */
@Module({
  imports: [AuthModule, SpeechServiceClientModule, BillingModule],
  controllers: [PronunciationLabController],
  providers: [PronunciationLabService],
})
export class PronunciationModule {}
