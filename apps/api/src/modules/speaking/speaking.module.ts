import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import { VocabularyModule } from '../vocabulary/index.js';
import {
  resolveSpeechSessionTokenConfig,
  SPEECH_SESSION_TOKEN_CONFIG,
} from './speaking-session-token.config.js';
import { SpeakingController } from './speaking.controller.js';
import { SpeakingService } from './speaking.service.js';

/**
 * `SpeakingModule` (E10 T2/T5). Imports `AuthModule` for `AuthGuard('jwt')`
 * (`AssessmentModule`'s own precedent), `AiEngineClientModule` so
 * `SpeakingService` can call `startSession`/`endSession`/
 * `scoreFluencyAndExtractVocabulary` — the first real caller of each,
 * previously registered app-wide but unconsumed
 * (`ai-engine-client.module.ts`'s own doc comment) — and `VocabularyModule`
 * (T5) for `PersonalDictionaryService`, its first cross-module consumer.
 * `DomainEventPublisher` (T5) needs no explicit import — `EventsModule` is
 * `@Global()`, the same precedent `AssessmentModule` already relies on.
 */
@Module({
  imports: [AuthModule, AiEngineClientModule, VocabularyModule],
  controllers: [SpeakingController],
  providers: [
    SpeakingService,
    { provide: SPEECH_SESSION_TOKEN_CONFIG, useFactory: () => resolveSpeechSessionTokenConfig() },
  ],
})
export class SpeakingModule {}
