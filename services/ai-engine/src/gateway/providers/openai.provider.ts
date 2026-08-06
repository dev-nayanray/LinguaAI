import OpenAI from 'openai';

import type {
  EmbedRequest,
  EmbedResponse,
  EmbeddingProvider,
  GenerateRequest,
  GenerateResponse,
  ModelProvider,
  StreamChunk,
} from '../model-provider.interface.js';

function toOpenAiMessages(request: GenerateRequest): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }
  for (const message of request.messages) {
    messages.push({ role: message.role, content: message.content });
  }
  return messages;
}

/**
 * The Router's configured failover target for generation (ARCHITECTURE.md
 * §7.1), and — per ADR-031 — the platform's one and only embedding
 * provider (`text-embedding-3-small`, chosen to match the already-shipped
 * `vector(1536)` columns exactly).
 */
export class OpenAiProvider implements ModelProvider, EmbeddingProvider {
  readonly name = 'openai' as const;

  private readonly client: OpenAI;

  constructor(apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const startedAt = Date.now();
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      messages: toOpenAiMessages(request),
    });

    const choice = response.choices[0];
    if (!choice?.message.content) {
      throw new Error('OpenAI generate() returned no content in the first choice');
    }

    return {
      content: choice.message.content,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      modelId: response.model,
      latencyMs: Date.now() - startedAt,
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const startedAt = Date.now();
    const stream = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      messages: toOpenAiMessages(request),
      stream: true,
      stream_options: { include_usage: true },
    });

    let modelId = request.model;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      modelId = chunk.model;
      const delta = chunk.choices[0]?.delta.content;
      if (delta) {
        yield { delta, done: false };
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    yield {
      delta: '',
      done: true,
      usage: { inputTokens, outputTokens, modelId, latencyMs: Date.now() - startedAt },
    };
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const response = await this.client.embeddings.create({
      model: request.model,
      input: request.input,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('OpenAI embed() returned no embedding in the response data');
    }

    return { embedding, modelId: response.model };
  }
}
