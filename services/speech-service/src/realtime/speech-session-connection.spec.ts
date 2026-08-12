import { randomUUID } from 'node:crypto';

import type { Logger } from '@linguaai/observability';
import type { AgentMessageStreamEvent } from '@linguaai/validation/ai-coaching';
import { WebSocket } from 'ws';

import type { AudioStorageProvider } from '../audio-storage/audio-storage.interface.js';
import type {
  SttProvider,
  TranscriptChunk,
  TtsProvider,
} from '../speech-provider/speech-provider.interface.js';
import {
  SpeechSessionConnection,
  type AiEngineClientLike,
  type SpeechSessionConnectionDeps,
  type WebSocketLike,
} from './speech-session-connection.js';

const UUID = randomUUID();
const OTHER_UUID = randomUUID();

function fakeClient(readyState: number = WebSocket.OPEN): WebSocketLike & { send: jest.Mock } {
  return { send: jest.fn(), readyState };
}

function fakeLogger(): Logger {
  return { info: jest.fn(), error: jest.fn() } as unknown as Logger;
}

async function* emptyAsyncIterable(): AsyncGenerator<TranscriptChunk> {}
async function* emptyAudioIterable(): AsyncGenerator<{ data: Buffer; done: boolean }> {}
async function* emptyAgentEvents(): AsyncGenerator<AgentMessageStreamEvent> {}

/**
 * Waits for the given queue to actually `end()` (like a real provider
 * would) before yielding a single, fixed final transcript — critical for
 * these tests, since `SpeechSessionConnection`'s own constructor already
 * starts a first turn immediately with an empty queue; an STT fixture that
 * yields *without* waiting for `end()` would fire a spurious round trip
 * before the test ever gets to push audio or send `speech.end-of-turn`.
 */
function finalTranscriptAfterDrain(text: string): SttProvider {
  return {
    name: 'openai',
    streamTranscribe: jest.fn((queue: AsyncIterable<Buffer>) =>
      (async function* (): AsyncGenerator<TranscriptChunk> {
        const drained: Buffer[] = [];
        for await (const chunk of queue) {
          drained.push(chunk);
        }
        yield { text, isFinal: true };
      })(),
    ),
  };
}

function endOfTurnMessage(sessionId: string): Buffer {
  return Buffer.from(
    JSON.stringify({ type: 'speech.end-of-turn', payload: {}, sessionId, ts: Date.now() }),
  );
}

function sentMessages(client: { send: jest.Mock }): unknown[] {
  return client.send.mock.calls.map(([raw]) => JSON.parse(raw as string));
}

async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function baseDeps(
  overrides: Partial<SpeechSessionConnectionDeps> = {},
): SpeechSessionConnectionDeps {
  return {
    sttProvider: {
      name: 'openai',
      streamTranscribe: jest.fn().mockReturnValue(emptyAsyncIterable()),
    },
    ttsProvider: {
      name: 'openai',
      streamSynthesize: jest.fn().mockReturnValue(emptyAudioIterable()),
    },
    aiEngineClient: {
      streamMessage: jest.fn().mockReturnValue(emptyAgentEvents()),
      updateMessageAudioUrl: jest.fn().mockResolvedValue(undefined),
    },
    audioStorage: { upload: jest.fn().mockResolvedValue({ url: 'https://storage.example.com/x' }) },
    logger: fakeLogger(),
    ...overrides,
  };
}

describe('SpeechSessionConnection', () => {
  it('starts a turn (calls streamTranscribe) as soon as the connection is constructed', () => {
    const deps = baseDeps();
    new SpeechSessionConnection(fakeClient(), UUID, deps);

    expect(deps.sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
  });

  it('acks every binary chunk with an increasing, per-connection forSeq scoped to the sessionId', () => {
    const client = fakeClient();
    const connection = new SpeechSessionConnection(client, UUID, baseDeps());

    connection.handleMessage(Buffer.from('chunk-a'), true);
    connection.handleMessage(Buffer.from('chunk-b'), true);

    expect(sentMessages(client)).toEqual([
      { type: 'ack', payload: { forSeq: 1 }, sessionId: UUID, ts: expect.any(Number) },
      { type: 'ack', payload: { forSeq: 2 }, sessionId: UUID, ts: expect.any(Number) },
    ]);
  });

  it('ignores a malformed (non-JSON) control message without throwing or acking', () => {
    const client = fakeClient();
    const deps = baseDeps();
    const connection = new SpeechSessionConnection(client, UUID, deps);

    expect(() => connection.handleMessage(Buffer.from('not json'), false)).not.toThrow();
    expect(client.send).not.toHaveBeenCalled();
    expect(deps.sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores a control message whose own sessionId does not match this connection', () => {
    const deps = baseDeps();
    const connection = new SpeechSessionConnection(fakeClient(), UUID, deps);

    connection.handleMessage(endOfTurnMessage(OTHER_UUID), false);

    expect(deps.sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
  });

  it('never sends a message once the client is no longer OPEN', () => {
    const client = fakeClient(WebSocket.CLOSING);
    const connection = new SpeechSessionConnection(client, UUID, baseDeps());

    connection.handleMessage(Buffer.from('chunk'), true);

    expect(client.send).not.toHaveBeenCalled();
  });

  it('logs, rather than throws, when the STT provider itself fails for a turn', async () => {
    const deps = baseDeps({
      sttProvider: {
        name: 'openai',
        streamTranscribe: jest.fn().mockImplementation(
          // eslint-disable-next-line require-yield -- deliberately throws before any yield, to test the STT-failure catch path.
          async function* (): AsyncGenerator<TranscriptChunk> {
            throw new Error('boom');
          },
        ),
      },
    });
    new SpeechSessionConnection(fakeClient(), UUID, deps);

    await flush();

    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: UUID }),
      'STT streaming failed for a speaking session turn',
    );
  });

  describe('graceful degradation on a real STT/TTS failure (T6, §6.5)', () => {
    function throwingStt(): SttProvider {
      return {
        name: 'openai',
        streamTranscribe: jest.fn().mockImplementation(
          // eslint-disable-next-line require-yield -- deliberately throws before any yield.
          async function* (): AsyncGenerator<TranscriptChunk> {
            throw new Error('stt boom');
          },
        ),
      };
    }

    it('sends a speech.degraded (stt_failure) message once the STT provider fails', async () => {
      const client = fakeClient();
      const deps = baseDeps({ sttProvider: throwingStt() });
      new SpeechSessionConnection(client, UUID, deps);

      await flush();

      expect(sentMessages(client)).toContainEqual(
        expect.objectContaining({
          type: 'speech.degraded',
          payload: { reason: 'stt_failure' },
          sessionId: UUID,
        }),
      );
    });

    it('stops attempting STT for subsequent turns once degraded, and never sends a second speech.degraded message', async () => {
      const client = fakeClient();
      const sttProvider = throwingStt();
      const deps = baseDeps({ sttProvider });
      const connection = new SpeechSessionConnection(client, UUID, deps);
      await flush();

      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush();

      expect(sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
      const degradedMessages = sentMessages(client).filter(
        (message) => (message as { type?: string }).type === 'speech.degraded',
      );
      expect(degradedMessages).toHaveLength(1);
    });

    it('sends a speech.degraded (tts_failure) message when TTS synthesis fails, but still relays ai.token/ai.done as text', async () => {
      async function* agentEvents(): AsyncGenerator<AgentMessageStreamEvent> {
        yield { type: 'token', delta: 'Hola. ' };
        yield {
          type: 'done',
          messageId: 'assistant-msg-1',
          assistantMessage: 'Hola.',
          promptVersion: 'v1',
          modelId: 'model',
        };
      }
      const ttsProvider: TtsProvider = {
        name: 'openai',
        streamSynthesize: jest.fn().mockImplementation(
          // eslint-disable-next-line require-yield -- deliberately throws before any yield.
          async function* (): AsyncGenerator<{ data: Buffer; done: boolean }> {
            throw new Error('tts boom');
          },
        ),
      };
      const aiEngineClient: AiEngineClientLike = {
        streamMessage: jest.fn().mockReturnValue(agentEvents()),
        updateMessageAudioUrl: jest.fn(),
      };
      const client = fakeClient();
      const deps = baseDeps({
        sttProvider: finalTranscriptAfterDrain('hola'),
        ttsProvider,
        aiEngineClient,
      });
      new SpeechSessionConnection(client, UUID, deps).handleMessage(endOfTurnMessage(UUID), false);
      await flush(10);

      const messages = sentMessages(client);
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'speech.degraded',
          payload: { reason: 'tts_failure' },
        }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'ai.token', payload: { delta: 'Hola. ' } }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'ai.done', payload: { text: 'Hola.' } }),
      );
      // No further speech.* audio messages once degraded, including the
      // whole-turn "done" marker `completeTurn` would otherwise always send.
      expect(messages.some((m) => (m as { type?: string }).type === 'speech.audio-chunk')).toBe(
        false,
      );
      expect(aiEngineClient.updateMessageAudioUrl).not.toHaveBeenCalled();
    });

    it('never even calls the TTS provider again on a later turn once degraded', async () => {
      const ttsProvider: TtsProvider = {
        name: 'openai',
        streamSynthesize: jest.fn().mockImplementation(
          // eslint-disable-next-line require-yield -- deliberately throws before any yield.
          async function* (): AsyncGenerator<{ data: Buffer; done: boolean }> {
            throw new Error('tts boom');
          },
        ),
      };
      async function* agentEvents(): AsyncGenerator<AgentMessageStreamEvent> {
        yield { type: 'token', delta: 'Hola.' };
        yield {
          type: 'done',
          messageId: 'assistant-msg-1',
          assistantMessage: 'Hola.',
          promptVersion: 'v1',
          modelId: 'model',
        };
      }
      const deps = baseDeps({
        sttProvider: finalTranscriptAfterDrain('hola'),
        ttsProvider,
        aiEngineClient: {
          streamMessage: jest.fn(() => agentEvents()),
          updateMessageAudioUrl: jest.fn(),
        },
      });
      const connection = new SpeechSessionConnection(fakeClient(), UUID, deps);
      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush(10);
      expect(ttsProvider.streamSynthesize).toHaveBeenCalledTimes(1);

      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush(10);

      expect(ttsProvider.streamSynthesize).toHaveBeenCalledTimes(1);
    });
  });

  it('ends the current turn on handleClose, so a pending STT stream completes rather than hanging', async () => {
    let drainedPromise: Promise<Buffer[]> | undefined;
    const deps = baseDeps({
      sttProvider: {
        name: 'openai',
        streamTranscribe: jest.fn((queue: AsyncIterable<Buffer>) => {
          drainedPromise = (async () => {
            const drained: Buffer[] = [];
            for await (const chunk of queue) {
              drained.push(chunk);
            }
            return drained;
          })();
          return emptyAsyncIterable();
        }),
      },
    });
    const connection = new SpeechSessionConnection(fakeClient(), UUID, deps);

    connection.handleClose();

    await expect(drainedPromise).resolves.toEqual([]);
  });

  describe('the T4 round trip (final transcript -> ai-engine -> TTS)', () => {
    function withFinalTranscript(
      text: string,
      overrides: Partial<SpeechSessionConnectionDeps> = {},
    ) {
      return baseDeps({ sttProvider: finalTranscriptAfterDrain(text), ...overrides });
    }

    it('does nothing (no ai-engine call) when the final transcript is empty', async () => {
      const deps = withFinalTranscript('   ');
      const connection = new SpeechSessionConnection(fakeClient(), UUID, deps);

      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush();

      expect(deps.aiEngineClient.streamMessage).not.toHaveBeenCalled();
    });

    it('uploads the turn own raw audio and forwards its URL as audioUrl to ai-engine', async () => {
      const aiEngineClient: AiEngineClientLike = {
        streamMessage: jest.fn().mockReturnValue(emptyAgentEvents()),
        updateMessageAudioUrl: jest.fn().mockResolvedValue(undefined),
      };
      const upload = jest
        .fn()
        .mockResolvedValue({ url: 'https://storage.example.com/turn-1-user.webm' });
      const deps = withFinalTranscript('hola', {
        aiEngineClient,
        audioStorage: { upload } as unknown as AudioStorageProvider,
      });
      const connection = new SpeechSessionConnection(fakeClient(), UUID, deps);

      connection.handleMessage(Buffer.from('raw-audio-bytes'), true);
      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush();

      expect(upload).toHaveBeenCalledWith({
        key: `speaking-sessions/${UUID}/1-user.webm`,
        body: Buffer.from('raw-audio-bytes'),
        contentType: 'audio/webm',
      });
      expect(aiEngineClient.streamMessage).toHaveBeenCalledWith(UUID, {
        userMessage: 'hola',
        variables: {},
        audioUrl: 'https://storage.example.com/turn-1-user.webm',
      });
    });

    it('never uploads user audio when the turn had none', async () => {
      const upload = jest.fn().mockResolvedValue({ url: 'https://storage.example.com/x' });
      const aiEngineClient: AiEngineClientLike = {
        streamMessage: jest.fn().mockReturnValue(emptyAgentEvents()),
        updateMessageAudioUrl: jest.fn(),
      };
      const deps = withFinalTranscript('hola', {
        aiEngineClient,
        audioStorage: { upload } as unknown as AudioStorageProvider,
      });
      const connection = new SpeechSessionConnection(fakeClient(), UUID, deps);

      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush();

      expect(upload).not.toHaveBeenCalled();
      expect(aiEngineClient.streamMessage).toHaveBeenCalledWith(UUID, {
        userMessage: 'hola',
        variables: {},
        audioUrl: undefined,
      });
    });

    it('relays ai.token/ai.done live, synthesizes each completed sentence, streams speech.audio-chunk, and attaches the assistant own uploaded audioUrl', async () => {
      async function* agentEvents(): AsyncGenerator<AgentMessageStreamEvent> {
        yield { type: 'token', delta: 'Hola. ' };
        yield { type: 'token', delta: 'Amigo.' };
        yield {
          type: 'done',
          messageId: 'assistant-msg-1',
          assistantMessage: 'Hola. Amigo.',
          promptVersion: 'v1',
          modelId: 'model',
        };
      }
      const ttsProvider: TtsProvider = {
        name: 'openai',
        streamSynthesize: jest.fn((text: string) =>
          (async function* (): AsyncGenerator<{ data: Buffer; done: boolean }> {
            yield { data: Buffer.from(`audio:${text}`), done: false };
            yield { data: Buffer.alloc(0), done: true };
          })(),
        ),
      };
      const upload = jest
        .fn()
        .mockResolvedValueOnce({ url: 'https://storage.example.com/turn-1-assistant.mp3' });
      const aiEngineClient: AiEngineClientLike = {
        streamMessage: jest.fn().mockReturnValue(agentEvents()),
        updateMessageAudioUrl: jest.fn().mockResolvedValue(undefined),
      };
      const client = fakeClient();
      const deps = withFinalTranscript('hola', {
        ttsProvider,
        aiEngineClient,
        audioStorage: { upload } as unknown as AudioStorageProvider,
      });
      const connection = new SpeechSessionConnection(client, UUID, deps);

      connection.handleMessage(endOfTurnMessage(UUID), false);
      await flush(10);

      const messages = sentMessages(client);
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'ai.token', payload: { delta: 'Hola. ' } }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'ai.token', payload: { delta: 'Amigo.' } }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'ai.done', payload: { text: 'Hola. Amigo.' } }),
      );
      // One synthesis call for the sentence completed mid-stream ("Hola."),
      // one for the trailing flush ("Amigo.").
      expect(ttsProvider.streamSynthesize).toHaveBeenCalledWith('Hola.');
      expect(ttsProvider.streamSynthesize).toHaveBeenCalledWith('Amigo.');
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'speech.audio-chunk',
          payload: { audio: Buffer.from('audio:Hola.').toString('base64'), done: false },
        }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'speech.audio-chunk',
          payload: { audio: Buffer.from('audio:Amigo.').toString('base64'), done: false },
        }),
      );
      // The connection's own final, whole-turn done marker.
      expect(messages).toContainEqual(
        expect.objectContaining({ type: 'speech.audio-chunk', payload: { audio: '', done: true } }),
      );

      expect(upload).toHaveBeenCalledWith({
        key: `speaking-sessions/${UUID}/1-assistant.mp3`,
        body: Buffer.concat([Buffer.from('audio:Hola.'), Buffer.from('audio:Amigo.')]),
        contentType: 'audio/mpeg',
      });
      expect(aiEngineClient.updateMessageAudioUrl).toHaveBeenCalledWith(
        UUID,
        'assistant-msg-1',
        'https://storage.example.com/turn-1-assistant.mp3',
      );
    });

    it('never attaches an audioUrl when the assistant reply produced no audio at all', async () => {
      async function* agentEvents(): AsyncGenerator<AgentMessageStreamEvent> {
        yield {
          type: 'done',
          messageId: 'assistant-msg-1',
          assistantMessage: '',
          promptVersion: 'v1',
          modelId: 'model',
        };
      }
      const aiEngineClient: AiEngineClientLike = {
        streamMessage: jest.fn().mockReturnValue(agentEvents()),
        updateMessageAudioUrl: jest.fn(),
      };
      const upload = jest.fn();
      const deps = withFinalTranscript('hola', {
        aiEngineClient,
        audioStorage: { upload } as unknown as AudioStorageProvider,
      });
      new SpeechSessionConnection(fakeClient(), UUID, deps).handleMessage(
        endOfTurnMessage(UUID),
        false,
      );
      await flush(10);

      expect(upload).not.toHaveBeenCalled();
      expect(aiEngineClient.updateMessageAudioUrl).not.toHaveBeenCalled();
    });

    it('logs (not throws) when ai-engine reports a mid-stream error event', async () => {
      async function* agentEvents(): AsyncGenerator<AgentMessageStreamEvent> {
        yield { type: 'error', message: 'stream interrupted' };
      }
      const deps = withFinalTranscript('hola', {
        aiEngineClient: {
          streamMessage: jest.fn().mockReturnValue(agentEvents()),
          updateMessageAudioUrl: jest.fn(),
        },
      });
      new SpeechSessionConnection(fakeClient(), UUID, deps).handleMessage(
        endOfTurnMessage(UUID),
        false,
      );
      await flush(10);

      expect(deps.logger.error).toHaveBeenCalledWith(
        { sessionId: UUID, message: 'stream interrupted' },
        'ai-engine stream reported an error mid-turn',
      );
    });
  });
});
