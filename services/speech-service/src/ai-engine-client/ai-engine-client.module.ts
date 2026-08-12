import { Module } from '@nestjs/common';

import { AI_ENGINE_CLIENT_CONFIG, resolveAiEngineClientConfig } from './ai-engine-client.config.js';
import { AiEngineClientService } from './ai-engine-client.service.js';

/**
 * `services/speech-service`'s own copy of the `apps/api`↔`ai-engine`
 * internal-client pattern (E10 T4, ADR-033/044) — a second, independent
 * caller of `ai-engine`'s `AgentSessionsController`, not a shared instance.
 */
@Module({
  providers: [
    { provide: AI_ENGINE_CLIENT_CONFIG, useFactory: () => resolveAiEngineClientConfig() },
    AiEngineClientService,
  ],
  exports: [AiEngineClientService],
})
export class AiEngineClientModule {}
