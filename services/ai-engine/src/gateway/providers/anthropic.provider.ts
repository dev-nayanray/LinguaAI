import Anthropic from '@anthropic-ai/sdk';

import type {
  ChatMessage,
  GenerateRequest,
  GenerateResponse,
  ModelProvider,
  StreamChunk,
} from '../model-provider.interface.js';

/** Anthropic's Messages API only accepts 'user'/'assistant' in the messages array — 'system' is a top-level parameter, not a message role. */
function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Extracts concatenated text from Anthropic's content-block array — a response can contain multiple blocks (e.g. thinking + text); this provider only ever surfaces the text blocks to callers. */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic' as const;

  private readonly client: Anthropic;

  constructor(apiKey: string, client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const startedAt = Date.now();
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
    });

    return {
      content: extractText(response.content),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      modelId: response.model,
      latencyMs: Date.now() - startedAt,
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const startedAt = Date.now();
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { delta: event.delta.text, done: false };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      delta: '',
      done: true,
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        modelId: finalMessage.model,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
