import { Module } from '@nestjs/common';

import { AI_ENGINE_CLIENT_CONFIG, resolveAiEngineClientConfig } from './ai-engine-client.config.js';
import { AiEngineClientService } from './ai-engine-client.service.js';

/**
 * ADR-033 (T10). `scoreWriting()` (E6 T5) has a real consumer as of E6-T7
 * (`AssessmentModule` imports this module to score WRITING responses);
 * `startSession()`/`endSession()` get their first real consumer as of
 * E10 T2 (`SpeakingModule`). `streamMessage()` remains registered but
 * unconsumed — a user-facing text-chat endpoint is a separate, not-yet-
 * built feature epic's own scope (the Personal AI Language Teacher epic,
 * per ROADMAP.md), same "build the real mechanism, flag the not-yet-wired
 * consumer" precedent E5 T7's RAG Retrieval Layer already set.
 */
@Module({
  providers: [
    { provide: AI_ENGINE_CLIENT_CONFIG, useFactory: () => resolveAiEngineClientConfig() },
    AiEngineClientService,
  ],
  exports: [AiEngineClientService],
})
export class AiEngineClientModule {}
