import { Module } from '@nestjs/common';

import {
  AI_GATEWAY_CONFIG,
  ANTHROPIC_PROVIDER,
  OPENAI_PROVIDER,
  resolveAiGatewayConfig,
} from './gateway.config.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { RouterService } from './router.service.js';

/**
 * The AI gateway (AI_SYSTEM.md §2, ADR-006). E5 T1's own scope: the
 * `ModelProvider` interface, real Anthropic/OpenAI adapters, and the
 * Router. Later E5 tasks (Prompt Manager, Orchestrator, Memory Manager,
 * RAG Retrieval Layer, Safety Layer, Cost Meter) extend this module, not
 * replace it.
 */
@Module({
  providers: [
    { provide: AI_GATEWAY_CONFIG, useFactory: () => resolveAiGatewayConfig() },
    {
      provide: ANTHROPIC_PROVIDER,
      inject: [AI_GATEWAY_CONFIG],
      useFactory: (config: ReturnType<typeof resolveAiGatewayConfig>) =>
        new AnthropicProvider(config.anthropicApiKey),
    },
    {
      provide: OPENAI_PROVIDER,
      inject: [AI_GATEWAY_CONFIG],
      useFactory: (config: ReturnType<typeof resolveAiGatewayConfig>) =>
        new OpenAiProvider(config.openAiApiKey),
    },
    RouterService,
  ],
  exports: [RouterService],
})
export class GatewayModule {}
