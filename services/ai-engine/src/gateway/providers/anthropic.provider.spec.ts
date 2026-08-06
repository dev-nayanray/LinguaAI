import type Anthropic from '@anthropic-ai/sdk';

import { AnthropicProvider } from './anthropic.provider.js';

function fakeClient(overrides: Partial<Anthropic['messages']> = {}): Anthropic {
  return {
    messages: { create: jest.fn(), stream: jest.fn(), ...overrides },
  } as unknown as Anthropic;
}

describe('AnthropicProvider', () => {
  it('constructs a real Anthropic SDK client when none is injected', () => {
    expect(() => new AnthropicProvider('fake-key')).not.toThrow();
  });

  describe('generate', () => {
    it('extracts text content and token usage from a real-shaped response', async () => {
      const client = fakeClient({
        create: jest.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Hola, ' },
            { type: 'text', text: 'como estas?' },
          ],
          usage: { input_tokens: 12, output_tokens: 8 },
          model: 'claude-sonnet-5',
        }),
      });
      const provider = new AnthropicProvider('fake-key', client);

      const result = await provider.generate({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'Say hello in Spanish' }],
      });

      expect(result.content).toBe('Hola, como estas?');
      expect(result.inputTokens).toBe(12);
      expect(result.outputTokens).toBe(8);
      expect(result.modelId).toBe('claude-sonnet-5');
    });

    it('excludes non-text content blocks (e.g. thinking/tool_use) from the extracted content', async () => {
      const client = fakeClient({
        create: jest.fn().mockResolvedValue({
          content: [
            { type: 'thinking', thinking: 'internal reasoning, never surfaced' },
            { type: 'text', text: 'the real answer' },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
          model: 'claude-sonnet-5',
        }),
      });
      const provider = new AnthropicProvider('fake-key', client);

      const result = await provider.generate({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result.content).toBe('the real answer');
    });

    it('never sends a "system" role inside the messages array — Anthropic requires it as a top-level parameter', async () => {
      const create = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        model: 'claude-sonnet-5',
      });
      const client = fakeClient({ create });
      const provider = new AnthropicProvider('fake-key', client);

      await provider.generate({
        model: 'claude-sonnet-5',
        systemPrompt: 'You are a helpful teacher.',
        messages: [
          { role: 'system', content: 'ignored, should never reach the messages array' },
          { role: 'user', content: 'hi' },
        ],
      });

      const callArgs = create.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a helpful teacher.');
      expect(callArgs.messages).toEqual([{ role: 'user', content: 'hi' }]);
    });
  });

  describe('stream', () => {
    it('yields text deltas and a final usage-bearing chunk, ignoring non-text-delta events', async () => {
      async function* fakeEvents() {
        yield { type: 'message_start' };
        yield { type: 'content_block_start' };
        yield {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{}' },
        };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ho' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'la' } };
      }
      const streamHandle = Object.assign(fakeEvents(), {
        finalMessage: jest.fn().mockResolvedValue({
          usage: { input_tokens: 3, output_tokens: 2 },
          model: 'claude-sonnet-5',
        }),
      });
      const client = fakeClient({ stream: jest.fn().mockReturnValue(streamHandle) });
      const provider = new AnthropicProvider('fake-key', client);

      const chunks = [];
      for await (const chunk of provider.stream({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toEqual({ delta: 'Ho', done: false });
      expect(chunks[1]).toEqual({ delta: 'la', done: false });
      expect(chunks[2]).toEqual({
        delta: '',
        done: true,
        usage: {
          inputTokens: 3,
          outputTokens: 2,
          modelId: 'claude-sonnet-5',
          latencyMs: expect.any(Number),
        },
      });
    });
  });
});
