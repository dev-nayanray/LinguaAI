import type OpenAI from 'openai';

import { OpenAiProvider } from './openai.provider.js';

function fakeClient(
  overrides: {
    chatCreate?: jest.Mock;
    embedCreate?: jest.Mock;
  } = {},
): OpenAI {
  return {
    chat: { completions: { create: overrides.chatCreate ?? jest.fn() } },
    embeddings: { create: overrides.embedCreate ?? jest.fn() },
  } as unknown as OpenAI;
}

async function* fakeChunks(chunks: unknown[]): AsyncIterable<unknown> {
  for (const chunk of chunks) yield chunk;
}

describe('OpenAiProvider', () => {
  it('constructs a real OpenAI SDK client when none is injected', () => {
    expect(() => new OpenAiProvider('fake-key')).not.toThrow();
  });

  describe('generate', () => {
    it('defaults token counts to 0 when the response has no usage field', async () => {
      const chatCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
        model: 'gpt-4o',
      });
      const provider = new OpenAiProvider('fake-key', fakeClient({ chatCreate }));

      const result = await provider.generate({ model: 'gpt-4o', messages: [] });

      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });
    it('extracts the first choice content and token usage', async () => {
      const chatCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Bonjour!' } }],
        usage: { prompt_tokens: 6, completion_tokens: 3 },
        model: 'gpt-4o',
      });
      const provider = new OpenAiProvider('fake-key', fakeClient({ chatCreate }));

      const result = await provider.generate({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Say hi in French' }],
      });

      expect(result.content).toBe('Bonjour!');
      expect(result.inputTokens).toBe(6);
      expect(result.outputTokens).toBe(3);
      expect(result.modelId).toBe('gpt-4o');
    });

    it('prepends a system message when systemPrompt is set', async () => {
      const chatCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
        model: 'gpt-4o',
      });
      const provider = new OpenAiProvider('fake-key', fakeClient({ chatCreate }));

      await provider.generate({
        model: 'gpt-4o',
        systemPrompt: 'Be concise.',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const callArgs = chatCreate.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
    });

    it('throws rather than returning a silently-empty result when no content is present', async () => {
      const chatCreate = jest
        .fn()
        .mockResolvedValue({ choices: [{ message: {} }], model: 'gpt-4o' });
      const provider = new OpenAiProvider('fake-key', fakeClient({ chatCreate }));

      await expect(provider.generate({ model: 'gpt-4o', messages: [] })).rejects.toThrow(
        'OpenAI generate() returned no content',
      );
    });
  });

  describe('stream', () => {
    it('yields text deltas and a final usage-bearing chunk', async () => {
      const chatCreate = jest.fn().mockResolvedValue(
        fakeChunks([
          { choices: [{ delta: { content: 'Bon' } }], model: 'gpt-4o' },
          { choices: [{ delta: { content: 'jour!' } }], model: 'gpt-4o' },
          {
            choices: [{ delta: {} }],
            model: 'gpt-4o',
            usage: { prompt_tokens: 4, completion_tokens: 2 },
          },
        ]),
      );
      const provider = new OpenAiProvider('fake-key', fakeClient({ chatCreate }));

      const chunks = [];
      for await (const chunk of provider.stream({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Say hi in French' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toEqual({ delta: 'Bon', done: false });
      expect(chunks[1]).toEqual({ delta: 'jour!', done: false });
      expect(chunks[2]).toEqual({
        delta: '',
        done: true,
        usage: {
          inputTokens: 4,
          outputTokens: 2,
          modelId: 'gpt-4o',
          latencyMs: expect.any(Number),
        },
      });
      expect(chatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true, stream_options: { include_usage: true } }),
      );
    });

    it('does not yield a chunk for an empty delta (e.g. a role-only or usage-only chunk)', async () => {
      const chatCreate = jest
        .fn()
        .mockResolvedValue(
          fakeChunks([{ choices: [{ delta: { role: 'assistant' } }], model: 'gpt-4o' }]),
        );
      const provider = new OpenAiProvider('fake-key', fakeClient({ chatCreate }));

      const chunks = [];
      for await (const chunk of provider.stream({ model: 'gpt-4o', messages: [] })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        {
          delta: '',
          done: true,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            modelId: 'gpt-4o',
            latencyMs: expect.any(Number),
          },
        },
      ]);
    });
  });

  describe('embed', () => {
    it('returns the embedding vector and model id', async () => {
      const embedCreate = jest.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        model: 'text-embedding-3-small',
      });
      const provider = new OpenAiProvider('fake-key', fakeClient({ embedCreate }));

      const result = await provider.embed({ model: 'text-embedding-3-small', input: 'hola' });

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.modelId).toBe('text-embedding-3-small');
    });

    it('throws rather than returning a silently-empty embedding when no data is present', async () => {
      const embedCreate = jest
        .fn()
        .mockResolvedValue({ data: [], model: 'text-embedding-3-small' });
      const provider = new OpenAiProvider('fake-key', fakeClient({ embedCreate }));

      await expect(
        provider.embed({ model: 'text-embedding-3-small', input: 'hola' }),
      ).rejects.toThrow('OpenAI embed() returned no embedding');
    });
  });
});
