import { Inject, Injectable, Logger } from '@nestjs/common';

import { AI_GATEWAY_CONFIG, ANTHROPIC_PROVIDER, OPENAI_PROVIDER } from './gateway.config.js';
import type { AiGatewayModuleConfig } from './gateway.config.js';
import type {
  EmbedRequest,
  EmbedResponse,
  EmbeddingProvider,
  GenerateRequest,
  GenerateResponse,
  ModelProvider,
  StreamChunk,
} from './model-provider.interface.js';

/**
 * The two request classes `.env.example`'s own already-declared config
 * pins a model for (`AI_MODEL_TEACHER_DEFAULT`/`AI_MODEL_ASSESSMENT_DEFAULT`)
 * — this is T1's model-tiering mechanism: which model a request uses is
 * config-driven per class, never hardcoded per call site. A fuller
 * dynamic-tiering system (e.g. degrading to a cheaper model under cost
 * pressure) is T9's Cost Meter & Circuit Breaker's own concern, built on
 * top of this same per-class resolution, not a T1 redesign.
 */
export type AiRequestClass = 'teacher' | 'assessment';

@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);
  private readonly providersByName: Map<string, ModelProvider>;

  constructor(
    @Inject(AI_GATEWAY_CONFIG) private readonly config: AiGatewayModuleConfig,
    @Inject(ANTHROPIC_PROVIDER) private readonly anthropicProvider: ModelProvider,
    @Inject(OPENAI_PROVIDER) private readonly openAiProvider: ModelProvider & EmbeddingProvider,
  ) {
    this.providersByName = new Map([
      [anthropicProvider.name, anthropicProvider],
      [openAiProvider.name, openAiProvider],
    ]);
  }

  private modelFor(requestClass: AiRequestClass): string {
    return requestClass === 'teacher' ? this.config.teacherModel : this.config.assessmentModel;
  }

  private primaryProvider(): ModelProvider {
    const provider = this.providersByName.get(this.config.defaultProvider);
    if (!provider) {
      throw new Error(
        `No provider registered for AI_GATEWAY_DEFAULT_PROVIDER="${this.config.defaultProvider}"`,
      );
    }
    return provider;
  }

  /** The one other registered provider — the failover target (ARCHITECTURE.md §7.1). With exactly two providers, "secondary" is unambiguous; a third provider would need real priority ordering, not built here since only two exist. */
  private secondaryProvider(): ModelProvider {
    const secondary = [...this.providersByName.values()].find(
      (p) => p.name !== this.config.defaultProvider,
    );
    if (!secondary) {
      throw new Error(
        'No secondary provider registered — failover is impossible with only one provider configured',
      );
    }
    return secondary;
  }

  async generate(
    requestClass: AiRequestClass,
    request: Omit<GenerateRequest, 'model'>,
  ): Promise<GenerateResponse> {
    const fullRequest: GenerateRequest = { ...request, model: this.modelFor(requestClass) };
    const primary = this.primaryProvider();

    try {
      return await primary.generate(fullRequest);
    } catch (err) {
      this.logger.warn(
        `Primary provider "${primary.name}" failed for a "${requestClass}" generate request, failing over to secondary. Error: ${String(err)}`,
      );
      const secondary = this.secondaryProvider();
      return secondary.generate(fullRequest);
    }
  }

  /**
   * Failover only covers the case where the stream never yields a single
   * chunk before failing (a connection-level failure) — once the caller
   * has already received real content from the primary provider, retrying
   * against a secondary would duplicate that content with no way to
   * reconcile the two partial responses. This is a real, documented
   * limitation, not a silently-incomplete failover story.
   */
  async *stream(
    requestClass: AiRequestClass,
    request: Omit<GenerateRequest, 'model'>,
  ): AsyncIterable<StreamChunk> {
    const fullRequest: GenerateRequest = { ...request, model: this.modelFor(requestClass) };
    const primary = this.primaryProvider();

    let yieldedAnyChunk = false;
    try {
      for await (const chunk of primary.stream(fullRequest)) {
        yieldedAnyChunk = true;
        yield chunk;
      }
      return;
    } catch (err) {
      if (yieldedAnyChunk) {
        throw err;
      }
      this.logger.warn(
        `Primary provider "${primary.name}" failed before yielding any chunk for a "${requestClass}" stream request, failing over to secondary. Error: ${String(err)}`,
      );
    }

    const secondary = this.secondaryProvider();
    yield* secondary.stream(fullRequest);
  }

  /** No failover — ADR-031 pins exactly one embedding provider; a request for a model the embedding provider doesn't serve is a caller error, not a routing decision. */
  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    return this.openAiProvider.embed(request);
  }
}
