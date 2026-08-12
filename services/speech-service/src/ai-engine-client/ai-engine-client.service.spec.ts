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

describe('AiEngineClientService', () => {
  describe('streamMessage', () => {
    it('POSTs the validated request body and parses a real SSE stream into validated events', async () => {
      const doneEvent = JSON.stringify({
        type: 'done',
        messageId: '33333333-3333-3333-3333-333333333333',
        assistantMessage: 'hola',
        promptVersion: 'v1',
        modelId: 'claude-teacher-model',
      });
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        body: sseStreamFromChunks([`data: ${doneEvent}\n\n`]),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const events = [];
      for await (const event of client.streamMessage('session-1', {
        userMessage: 'hola',
        variables: {},
        audioUrl: 'https://storage.example.com/turn-1-user.webm',
      })) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: 'done',
          messageId: '33333333-3333-3333-3333-333333333333',
          assistantMessage: 'hola',
          promptVersion: 'v1',
          modelId: 'claude-teacher-model',
        },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/agent-sessions/session-1/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            userMessage: 'hola',
            variables: {},
            audioUrl: 'https://storage.example.com/turn-1-user.webm',
          }),
        }),
      );
    });

    it('throws a clear error when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'boom' } }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      const drain = async (): Promise<void> => {
        const iterator = client
          .streamMessage('session-1', { userMessage: 'hi', variables: {} })
          [Symbol.asyncIterator]();
        let result = await iterator.next();
        while (!result.done) {
          result = await iterator.next();
        }
      };

      await expect(drain()).rejects.toThrow('ai-engine returned 500');
    });
  });

  describe('updateMessageAudioUrl', () => {
    it('PATCHes the validated audioUrl', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await client.updateMessageAudioUrl(
        'session-1',
        'assistant-msg-1',
        'https://storage.example.com/assistant-msg-1.mp3',
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/agent-sessions/session-1/messages/assistant-msg-1/audio-url',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioUrl: 'https://storage.example.com/assistant-msg-1.mp3' }),
        },
      );
    });

    it('throws a clear error when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        client.updateMessageAudioUrl('session-1', 'missing', 'https://storage.example.com/x.mp3'),
      ).rejects.toThrow('ai-engine returned 404');
    });
  });

  describe('abandonSession', () => {
    it('POSTs the validated userId', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await client.abandonSession('session-1', '11111111-1111-1111-1111-111111111111');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-engine.internal:4001/v1/agent-sessions/session-1/abandon',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: '11111111-1111-1111-1111-111111111111' }),
        },
      );
    });

    it('throws a clear error when ai-engine responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new AiEngineClientService(config);

      await expect(
        client.abandonSession('session-1', '11111111-1111-1111-1111-111111111111'),
      ).rejects.toThrow('ai-engine returned 500 abandoning session "session-1"');
    });
  });
});
