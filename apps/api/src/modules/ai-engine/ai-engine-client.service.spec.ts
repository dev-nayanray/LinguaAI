import type { AiEngineClientEnv } from '@linguaai/config';

import { AiEngineClientService } from './ai-engine-client.service.js';

const config: AiEngineClientEnv = { AI_ENGINE_URL: 'http://ai-engine.internal:4001' };

function sseStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

function fakeFetch(): jest.MockedFunction<typeof fetch> {
  return jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
}

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
  const iterator = iterable[Symbol.asyncIterator]();
  let result = await iterator.next();
  while (!result.done) {
    result = await iterator.next();
  }
}

describe('AiEngineClientService', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('startSession', () => {
    it('POSTs the validated request body and returns the parsed sessionId', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ sessionId: '33333333-3333-3333-3333-333333333333' }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const result = await client.startSession({
        userId: '11111111-1111-1111-1111-111111111111',
        languageId: '22222222-2222-2222-2222-222222222222',
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/agent-sessions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const [, init] = fetchMock.mock.calls[0]!;
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        userId: '11111111-1111-1111-1111-111111111111',
        languageId: '22222222-2222-2222-2222-222222222222',
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });
      expect(result).toEqual({ sessionId: '33333333-3333-3333-3333-333333333333' });
    });

    it('throws a clear error when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        client.startSession({
          userId: '11111111-1111-1111-1111-111111111111',
          languageId: '22222222-2222-2222-2222-222222222222',
          orchestratorAgent: 'CONVERSATION_PARTNER',
        }),
      ).rejects.toThrow('ai-engine returned 500');
    });
  });

  describe('streamMessage', () => {
    it('parses a real SSE stream (chunked mid-line) into validated events', async () => {
      const tokenEvent = JSON.stringify({ type: 'token', delta: 'hel' });
      const doneEvent = JSON.stringify({
        type: 'done',
        assistantMessage: 'hello',
        promptVersion: 'v1',
        modelId: 'claude-teacher-model',
      });
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        body: sseStreamFromChunks([`data: ${tokenEvent}\n`, `\ndata: ${doneEvent}\n\n`]),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const events = [];
      for await (const event of client.streamMessage('session-1', {
        userMessage: 'hi',
        variables: {},
      })) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'token', delta: 'hel' },
        {
          type: 'done',
          assistantMessage: 'hello',
          promptVersion: 'v1',
          modelId: 'claude-teacher-model',
        },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/agent-sessions/session-1/messages',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws with the upstream error message when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'session not found' } }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        drain(client.streamMessage('missing', { userMessage: 'hi', variables: {} })),
      ).rejects.toThrow('session not found');
    });

    it('falls back to a generic message when the non-2xx response body is not valid JSON', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        drain(client.streamMessage('session-1', { userMessage: 'hi', variables: {} })),
      ).rejects.toThrow('unknown error');
    });

    it('throws when ai-engine returns a 2xx response with no body', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        drain(client.streamMessage('session-1', { userMessage: 'hi', variables: {} })),
      ).rejects.toThrow('no response body');
    });

    it('throws if ai-engine sends a payload that fails Zod validation, rather than silently forwarding it', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        body: sseStreamFromChunks([`data: ${JSON.stringify({ type: 'not-a-real-type' })}\n\n`]),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        drain(client.streamMessage('session-1', { userMessage: 'hi', variables: {} })),
      ).rejects.toThrow();
    });
  });

  describe('endSession', () => {
    it('POSTs to the end endpoint', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await client.endSession('session-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/agent-sessions/session-1/end',
        { method: 'POST' },
      );
    });

    it('throws a clear error when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(client.endSession('session-1')).rejects.toThrow('ai-engine returned 500');
    });
  });

  describe('scoreWriting', () => {
    const request = {
      languageId: '22222222-2222-2222-2222-222222222222',
      targetLanguageName: 'Spanish',
      prompt: 'Describe your ideal vacation.',
      learnerResponse: 'Mi vacacion ideal es en la playa.',
    };

    it('POSTs the validated request body and returns the parsed critique', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          cefrLevel: 'B1',
          confidence: 0.7,
          feedback: 'Good, if simple, writing.',
        }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const result = await client.scoreWriting(request);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/assessment-scoring/writing',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const [, init] = fetchMock.mock.calls[0]!;
      expect(JSON.parse((init as RequestInit).body as string)).toEqual(request);
      expect(result).toEqual({
        cefrLevel: 'B1',
        confidence: 0.7,
        feedback: 'Good, if simple, writing.',
      });
    });

    it('throws a clear error, including the upstream message, when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'model response failed schema validation' } }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(client.scoreWriting(request)).rejects.toThrow(
        'ai-engine returned 500 scoring a writing response: model response failed schema validation',
      );
    });
  });

  describe('draftLesson', () => {
    const request = {
      languageId: '22222222-2222-2222-2222-222222222222',
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2' as const,
      topic: 'Ordering food at a restaurant',
    };
    const draft = {
      title: 'Ordering Food',
      description: 'Learn key phrases for ordering food.',
      estimatedMinutes: 10,
      activities: [
        {
          type: 'READING',
          title: 'At the Restaurant',
          content: {},
          exercises: [
            { type: 'MULTIPLE_CHOICE', prompt: 'Choose the right phrase', correctAnswer: {} },
          ],
        },
      ],
    };

    it('POSTs the validated request body and returns the parsed draft', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => draft,
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const result = await client.draftLesson(request);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/content-authoring/draft-lesson',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const [, init] = fetchMock.mock.calls[0]!;
      expect(JSON.parse((init as RequestInit).body as string)).toEqual(request);
      expect(result).toEqual(draft);
    });

    it('throws a clear error, including the upstream message, when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'model response failed schema validation' } }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(client.draftLesson(request)).rejects.toThrow(
        'ai-engine returned 500 drafting a lesson: model response failed schema validation',
      );
    });
  });

  describe('draftVocabularyItem', () => {
    const request = {
      languageId: '22222222-2222-2222-2222-222222222222',
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2' as const,
      term: 'hola',
    };
    const draft = {
      term: 'hola',
      partOfSpeech: 'INTERJECTION',
      translations: { en: 'hello' },
    };

    it('POSTs the validated request body and returns the parsed draft', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => draft,
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const result = await client.draftVocabularyItem(request);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/content-authoring/draft-vocabulary-item',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const [, init] = fetchMock.mock.calls[0]!;
      expect(JSON.parse((init as RequestInit).body as string)).toEqual(request);
      expect(result).toEqual(draft);
    });

    it('throws a clear error, including the upstream message, when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'model response failed schema validation' } }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(client.draftVocabularyItem(request)).rejects.toThrow(
        'ai-engine returned 500 drafting a vocabulary item: model response failed schema validation',
      );
    });
  });
});
