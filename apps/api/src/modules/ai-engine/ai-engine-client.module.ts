import { Module } from '@nestjs/common';

import { AI_ENGINE_CLIENT_CONFIG, resolveAiEngineClientConfig } from './ai-engine-client.config.js';
import { AiEngineClientService } from './ai-engine-client.service.js';

/**
 * ADR-033 (T10): registered here (not yet consumed by any controller —
 * building a user-facing AI chat endpoint is each consuming feature
 * epic's own scope, e.g. E6 Personal AI Language Teacher, per
 * ROADMAP.md — not this internal-contract task's), same "build the real
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
