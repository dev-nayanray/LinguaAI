import { Module } from '@nestjs/common';

import { AI_ENGINE_CLIENT_CONFIG, resolveAiEngineClientConfig } from './ai-engine-client.config.js';
import { AiEngineClientService } from './ai-engine-client.service.js';

/**
 * ADR-033 (T10). `scoreWriting()` (E6 T5) has a real consumer as of E6-T7
 * (`AssessmentModule` imports this module to score WRITING responses);
 * `startSession()`/`streamMessage()`/`endSession()` remain registered but
 * unconsumed — building a user-facing AI chat endpoint is each consuming
 * feature epic's own scope, e.g. the Personal AI Language Teacher epic, per
 * ROADMAP.md — not this internal-contract task's, same "build the real
 * mechanism, flag the not-yet-wired consumer" precedent E5 T7's RAG
 * Retrieval Layer already set.
 */
@Module({
  providers: [
    { provide: AI_ENGINE_CLIENT_CONFIG, useFactory: () => resolveAiEngineClientConfig() },
    AiEngineClientService,
  ],
  exports: [AiEngineClientService],
})
export class AiEngineClientModule {}
