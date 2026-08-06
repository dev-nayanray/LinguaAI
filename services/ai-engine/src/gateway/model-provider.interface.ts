/**
 * The single interface every model provider is integrated behind
 * (AI_SYSTEM.md §2, ADR-006: "No application code calls an LLM/STT/TTS
 * SDK directly"). The Router (router.service.ts) is the only consumer
 * that selects a concrete provider; everything above the gateway talks
 * to the Router, never to `AnthropicProvider`/`OpenAiProvider` directly.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateRequest {
  /** Provider-specific model identifier (e.g. "claude-sonnet-5", "gpt-4o") — the Router resolves this per request class before calling a provider, never hardcoded in a provider itself. */
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** The model that actually served the request — may differ from GenerateRequest.model if a provider silently aliases it; always logged as-served, never assumed. */
  modelId: string;
  latencyMs: number;
}

export interface StreamChunk {
  /** Incremental text since the previous chunk — never the full accumulated text, matching every streaming SDK's own convention. */
  delta: string;
  done: boolean;
  /** Only populated on the final chunk (done: true) — token/latency accounting needs the same shape a non-streamed GenerateResponse has. */
  usage?: Pick<GenerateResponse, 'inputTokens' | 'outputTokens' | 'modelId' | 'latencyMs'>;
}

export interface EmbedRequest {
  model: string;
  input: string;
}

export interface EmbedResponse {
  embedding: number[];
  modelId: string;
}

/**
 * Every provider must support text generation (the Router's failover
 * story, §7.1, only makes sense across providers that both do). Embedding
 * is deliberately a *separate* interface, not a required method here —
 * Anthropic has no embeddings API at all, and forcing every provider to
 * implement `embed()` would mean either a fake stub that throws at
 * runtime for a call that was always structurally impossible, or an
 * awkward optional method every generate-only caller has to null-check.
 * ADR-031 already settled there is exactly one embedding provider and
 * model (`embedding.constants.ts`) — no failover story for embeddings
 * exists at this task's scope, so the Router's `embed()` talks to that
 * one `EmbeddingProvider` directly, not through provider selection.
 */
export interface ModelProvider {
  /** Lowercase provider identifier ("anthropic" | "openai") — matches AI_GATEWAY_DEFAULT_PROVIDER's own enum values (packages/config), so Router failover logic never string-compares against a differently-cased literal. */
  readonly name: 'anthropic' | 'openai';
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
}

export interface EmbeddingProvider {
  readonly name: 'anthropic' | 'openai';
  embed(request: EmbedRequest): Promise<EmbedResponse>;
}
