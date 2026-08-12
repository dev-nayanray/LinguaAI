import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { signSpeechSessionToken } from '@linguaai/utils';
import type {
  AgentMessageStreamEvent,
  SendAgentMessageRequest,
} from '@linguaai/validation/ai-coaching';
import { WebSocket } from 'ws';

import { AppModule } from '../src/app.module.js';
import { AiEngineClientService } from '../src/ai-engine-client/ai-engine-client.service.js';
import {
  SPEECH_PROVIDER_CONFIG,
  STT_PROVIDER,
  TTS_PROVIDER,
} from '../src/speech-provider/speech-provider.config.js';
import type {
  AudioChunk,
  SttProvider,
  TranscriptChunk,
  TtsProvider,
} from '../src/speech-provider/speech-provider.interface.js';

const SESSION_TOKEN_SECRET = process.env.SPEECH_SESSION_TOKEN_SECRET;
if (!SESSION_TOKEN_SECRET) {
  throw new Error('SPEECH_SESSION_TOKEN_SECRET must be set to run this e2e suite');
}

/**
 * A real, echoing STT stub — no live OpenAI credentials in this environment
 * (RISK_REGISTER R-88, the same standing limitation `openai-speech.provider.spec.ts`
 * itself already carries at the unit level). Genuinely drains the queue it's
 * given (proving audio really flowed end to end through the gateway) and
 * echoes the concatenated bytes back as the transcript text, so the test
 * can assert on exactly what was sent.
 */
function fakeSttProvider(): SttProvider & { streamTranscribe: jest.Mock } {
  return {
    name: 'openai',
    streamTranscribe: jest.fn((queue: AsyncIterable<Buffer>): AsyncGenerator<TranscriptChunk> =>
      (async function* (): AsyncGenerator<TranscriptChunk> {
        const drained: Buffer[] = [];
        for await (const chunk of queue) {
          drained.push(chunk);
        }
        yield { text: Buffer.concat(drained).toString('utf8'), isFinal: true };
      })(),
    ),
  };
}

/** A real, fixed-audio TTS stub — same RISK_REGISTER R-88 reasoning as the STT stub above. */
function fakeTtsProvider(): TtsProvider & { streamSynthesize: jest.Mock } {
  return {
    name: 'openai',
    streamSynthesize: jest.fn((): AsyncGenerator<AudioChunk> =>
      (async function* (): AsyncGenerator<AudioChunk> {
        yield { data: Buffer.from('fake-tts-audio-bytes'), done: false };
        yield { data: Buffer.alloc(0), done: true };
      })(),
    ),
  };
}

/**
 * A real, in-process ai-engine stub — `services/ai-engine` is a separately
 * deployed process this test environment doesn't run (mirrors
 * `apps/api`'s own established "stub AiEngineClientService at the
 * boundary" e2e discipline, e.g. `speaking.e2e-spec.ts`). Echoes the
 * caller's own `userMessage` back as a one-token, one-sentence reply so the
 * test can assert on exactly what the gateway relayed.
 */
function fakeAiEngineClient(): {
  streamMessage: jest.Mock;
  updateMessageAudioUrl: jest.Mock;
} {
  return {
    streamMessage: jest.fn(
      (
        _sessionId: string,
        input: SendAgentMessageRequest,
      ): AsyncGenerator<AgentMessageStreamEvent> =>
        (async function* (): AsyncGenerator<AgentMessageStreamEvent> {
          const reply = `You said: ${input.userMessage}.`;
          yield { type: 'token', delta: reply };
          yield {
            type: 'done',
            messageId: '33333333-3333-3333-3333-333333333333',
            assistantMessage: reply,
            promptVersion: 'v1',
            modelId: 'fake-model',
          };
        })(),
    ),
    updateMessageAudioUrl: jest.fn().mockResolvedValue(undefined),
  };
}

function waitForEvent<T = unknown>(target: WebSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    target.once(event, (arg: T) => {
      clearTimeout(timer);
      resolve(arg);
    });
  });
}

describe('SpeechSessionGateway (e2e)', () => {
  let app: INestApplication;
  let port: number;
  const sttProvider = fakeSttProvider();
  const ttsProvider = fakeTtsProvider();
  const aiEngineClient = fakeAiEngineClient();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SPEECH_PROVIDER_CONFIG)
      .useValue({ openAiApiKey: 'test-dummy' })
      .overrideProvider(STT_PROVIDER)
      .useValue(sttProvider)
      .overrideProvider(TTS_PROVIDER)
      .useValue(ttsProvider)
      .overrideProvider(AiEngineClientService)
      .useValue(aiEngineClient)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterEach(() => {
    sttProvider.streamTranscribe.mockClear();
    ttsProvider.streamSynthesize.mockClear();
    aiEngineClient.streamMessage.mockClear();
    aiEngineClient.updateMessageAudioUrl.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(path: string): WebSocket {
    return new WebSocket(`ws://127.0.0.1:${port}${path}`);
  }

  it('rejects a connection with no token at all', async () => {
    const ws = connect(`/realtime/speaking-sessions/${randomUUID()}`);
    await expect(waitForEvent(ws, 'unexpected-response')).resolves.toBeDefined();
  });

  it('rejects a connection with an invalid token', async () => {
    const ws = connect(`/realtime/speaking-sessions/${randomUUID()}?token=not-a-real-token`);
    await expect(waitForEvent(ws, 'unexpected-response')).resolves.toBeDefined();
  });

  it('accepts a real token, acks binary audio, and streams the final transcript on end-of-turn', async () => {
    const sessionId = randomUUID();
    const userId = randomUUID();
    const token = signSpeechSessionToken({ sessionId, userId }, SESSION_TOKEN_SECRET);
    const ws = connect(`/realtime/speaking-sessions/${sessionId}?token=${token}`);
    await waitForEvent(ws, 'open');

    const messages: unknown[] = [];
    ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString('utf8'))));

    ws.send(Buffer.from('hola'));
    ws.send(Buffer.from(' amigo'));
    ws.send(JSON.stringify({ type: 'speech.end-of-turn', payload: {}, sessionId, ts: Date.now() }));

    await new Promise((resolve) => setTimeout(resolve, 500));
    ws.close();

    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ack', payload: { forSeq: 1 } }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ack', payload: { forSeq: 2 } }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'speech.final-transcript',
        payload: { text: 'hola amigo' },
      }),
    );
    expect(sttProvider.streamTranscribe).toHaveBeenCalledTimes(2);
  });

  it("(T4) runs the full round trip: ai-engine's reply is relayed live, synthesized to real speech.audio-chunk messages, and the assistant's own audio is genuinely uploaded to local MinIO", async () => {
    const sessionId = randomUUID();
    const userId = randomUUID();
    const token = signSpeechSessionToken({ sessionId, userId }, SESSION_TOKEN_SECRET);
    const ws = connect(`/realtime/speaking-sessions/${sessionId}?token=${token}`);
    await waitForEvent(ws, 'open');

    const messages: unknown[] = [];
    ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString('utf8'))));

    ws.send(Buffer.from('hola'));
    ws.send(JSON.stringify({ type: 'speech.end-of-turn', payload: {}, sessionId, ts: Date.now() }));

    await new Promise((resolve) => setTimeout(resolve, 800));
    ws.close();

    expect(aiEngineClient.streamMessage).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ userMessage: 'hola', audioUrl: expect.stringContaining('http') }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ai.token', payload: { delta: 'You said: hola.' } }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ai.done', payload: { text: 'You said: hola.' } }),
    );
    const audioChunkMessages = messages.filter(
      (message): message is { type: string; payload: { audio: string; done: boolean } } =>
        (message as { type?: string }).type === 'speech.audio-chunk',
    );
    expect(audioChunkMessages.some((message) => message.payload.audio.length > 0)).toBe(true);
    expect(audioChunkMessages.some((message) => message.payload.done)).toBe(true);

    // The assistant's own synthesized audio was really uploaded to local
    // MinIO (no override on AUDIO_STORAGE_PROVIDER, RISK_REGISTER note in
    // ADR-047: S3 upload needs no live AI credentials, unlike STT/TTS) --
    // a real, non-empty URL was attached back onto the AIMessage row via
    // the stubbed ai-engine client.
    expect(aiEngineClient.updateMessageAudioUrl).toHaveBeenCalledWith(
      sessionId,
      '33333333-3333-3333-3333-333333333333',
      expect.stringContaining(`speaking-sessions/${sessionId}/1-assistant.mp3`),
    );
  }, 15000);

  it('(T6) degrades to text-only on a real TTS failure mid-session -- the client is honestly notified and the session survives', async () => {
    const sessionId = randomUUID();
    const userId = randomUUID();
    const token = signSpeechSessionToken({ sessionId, userId }, SESSION_TOKEN_SECRET);
    const ws = connect(`/realtime/speaking-sessions/${sessionId}?token=${token}`);
    await waitForEvent(ws, 'open');

    const messages: unknown[] = [];
    ws.on('message', (data: Buffer) => messages.push(JSON.parse(data.toString('utf8'))));

    ttsProvider.streamSynthesize.mockImplementationOnce(
      // eslint-disable-next-line require-yield -- deliberately throws before any yield, simulating a real provider outage.
      async function* (): AsyncGenerator<AudioChunk> {
        throw new Error('simulated TTS outage');
      },
    );

    ws.send(Buffer.from('hola'));
    ws.send(JSON.stringify({ type: 'speech.end-of-turn', payload: {}, sessionId, ts: Date.now() }));

    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'speech.degraded',
        payload: { reason: 'tts_failure' },
      }),
    );
    // The turn's own text still made it through -- degradation is text-only,
    // not a dropped connection or a failed turn.
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ai.token', payload: { delta: 'You said: hola.' } }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ai.done', payload: { text: 'You said: hola.' } }),
    );
    expect(messages.some((m) => (m as { type?: string }).type === 'speech.audio-chunk')).toBe(
      false,
    );
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // The session really survives: a second, ordinary turn after degrading
    // still gets a real reply (still text-only -- no further TTS attempts).
    ws.send(Buffer.from('adios'));
    ws.send(JSON.stringify({ type: 'speech.end-of-turn', payload: {}, sessionId, ts: Date.now() }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    ws.close();

    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'ai.token', payload: { delta: 'You said: adios.' } }),
    );
    const degradedMessages = messages.filter(
      (m) => (m as { type?: string }).type === 'speech.degraded',
    );
    expect(degradedMessages).toHaveLength(1);
  }, 15000);
});
