import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import {
  resolveSpeechSessionTokenConfig,
  SPEECH_SESSION_TOKEN_CONFIG,
} from './speaking-session-token.config.js';
import { SpeakingController } from './speaking.controller.js';
import { SpeakingService } from './speaking.service.js';

/**
 * `SpeakingModule` (E10 T2). Imports `AuthModule` for `AuthGuard('jwt')`
 * (`AssessmentModule`'s own precedent) and `AiEngineClientModule` so
 * `SpeakingService` can call `startSession`/`endSession` — both methods
 * were previously registered app-wide but unconsumed
 * (`ai-engine-client.module.ts`'s own doc comment); this is their first
 * real caller.
 */
@Module({
  imports: [AuthModule, AiEngineClientModule],
  controllers: [SpeakingController],
  providers: [
    SpeakingService,
    { provide: SPEECH_SESSION_TOKEN_CONFIG, useFactory: () => resolveSpeechSessionTokenConfig() },
  ],
})
export class SpeakingModule {}
