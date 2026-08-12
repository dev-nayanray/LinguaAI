import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { SpeechServiceClientModule } from '../speech-service-client/speech-service-client.module.js';
import { PronunciationLabController } from './pronunciation-lab.controller.js';
import { PronunciationLabService } from './pronunciation-lab.service.js';

/**
 * `PronunciationModule` (E11 T2). Imports `AuthModule` for `AuthGuard('jwt')`
 * (`SpeakingModule`'s own precedent) and `SpeechServiceClientModule` —
 * `PronunciationLabService`'s real, first consumer of
 * `SpeechServiceClientService`. `DomainEventPublisher` needs no explicit
 * import — `EventsModule` is `@Global()`, the same precedent
 * `SpeakingModule`/`AssessmentModule` already rely on.
 */
@Module({
  imports: [AuthModule, SpeechServiceClientModule],
  controllers: [PronunciationLabController],
  providers: [PronunciationLabService],
})
export class PronunciationModule {}
