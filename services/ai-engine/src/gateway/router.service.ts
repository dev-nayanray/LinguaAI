import { Inject, Injectable, Logger } from '@nestjs/common';

import { AI_EMBEDDING_DIMENSIONS, AI_EMBEDDING_MODEL } from './embedding.constants.js';
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
 * The three request classes `.env.example`'s own already-declared config
 * pins a model for (`AI_MODEL_TEACHER_DEFAULT`/`AI_MODEL_ASSESSMENT_DEFAULT`/
 * `AI_MODEL_CONTENT_DEFAULT`) — this is T1's model-tiering mechanism: which
 * model a request uses is config-driven per class, never hardcoded per call
 * site. A fuller dynamic-tiering system (e.g. degrading to a cheaper model
 * under cost pressure) is T9's Cost Meter & Circuit Breaker's own concern,
 * built on top of this same per-class resolution, not a T1 redesign.
 * `'content'` (E8 T4, ADR-041) is the third class — AI-assisted content
 * drafting has a materially different cost/latency/safety profile than
 * either conversational (`'teacher'`) or single-essay-scoring (`'assessment'`)
 * calls, so per-class cost monitoring (ADR-012's circuit breaker) stays
 * meaningful rather than conflating unrelated call shapes under one class.
 * `'fluency'` (E10 T5, ADR-048) is the fourth — session-end speaking-practice
 * scoring over a full conversation transcript, again a materially different
 * shape from the other three (rubric-scored, one-shot, no session/memory
 * concept of its own despite reading an existing session's history).
 */
export type AiRequestClass = 'teacher' | 'assessment' | 'content' | 'fluency';

/** ADR-034 (T9): 'economy' is the cost circuit breaker's DEGRADE target — falls back to 'default' per class if no economy model is configured, rather than failing the request over a config gap. */
export type ModelTier = 'default' | 'economy';

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

  /** One lookup per class, not a chain of binary ternaries — the shape that stopped scaling the moment a third class (`'content'`, E8 T4) existed. */
  private defaultModelFor(requestClass: AiRequestClass): string {
    switch (requestClass) {
      case 'teacher':
        return this.config.teacherModel;
      case 'assessment':
        return this.config.assessmentModel;
      case 'content':
        return this.config.contentModel;
      case 'fluency':
        return this.config.fluencyModel;
    }
  }

  private economyModelFor(requestClass: AiRequestClass): string | undefined {
    switch (requestClass) {
      case 'teacher':
        return this.config.teacherEconomyModel;
      case 'assessment':
        return this.config.assessmentEconomyModel;
      case 'content':
        return this.config.contentEconomyModel;
      case 'fluency':
        return this.config.fluencyEconomyModel;
    }
  }

  private modelFor(requestClass: AiRequestClass, tier: ModelTier): string {
    const defaultModel = this.defaultModelFor(requestClass);
    if (tier === 'default') {
      return defaultModel;
    }

    const economyModel = this.economyModelFor(requestClass);
    if (!economyModel) {
      this.logger.warn(
        `Economy tier requested for "${requestClass}" but no economy model is configured — using the default model instead.`,
      );
      return defaultModel;
    }
    return economyModel;
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
    tier: ModelTier = 'default',
  ): Promise<GenerateResponse> {
    const fullRequest: GenerateRequest = { ...request, model: this.modelFor(requestClass, tier) };
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
    tier: ModelTier = 'default',
  ): AsyncIterable<StreamChunk> {
    const fullRequest: GenerateRequest = { ...request, model: this.modelFor(requestClass, tier) };
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

  /**
   * No failover — ADR-031 pins exactly one embedding provider and exactly
   * one model. The caller never supplies a model (unlike `generate()`/
   * `stream()`, where the request class picks one) — there is only ever
   * one correct choice, so making it a parameter would just be one more
   * place a caller could accidentally get it wrong.
   */
  async embed(request: Omit<EmbedRequest, 'model'>): Promise<EmbedResponse> {
    const response = await this.openAiProvider.embed({ ...request, model: AI_EMBEDDING_MODEL });
    if (response.embedding.length !== AI_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding provider returned a ${response.embedding.length}-dimension vector, expected ${AI_EMBEDDING_DIMENSIONS} per ADR-031 — refusing to hand back a vector that would fail insertion into the vector(${AI_EMBEDDING_DIMENSIONS}) columns.`,
      );
    }
    return response;
  }
}
