import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { signSpeechSessionToken } from '@linguaai/utils';
import { WebSocket } from 'ws';

import { AppModule } from '../src/app.module.js';
import {
  SPEECH_PROVIDER_CONFIG,
  STT_PROVIDER,
} from '../src/speech-provider/speech-provider.config.js';
import type {
  SttProvider,
  TranscriptChunk,
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

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SPEECH_PROVIDER_CONFIG)
      .useValue({ openAiApiKey: 'test-dummy' })
      .overrideProvider(STT_PROVIDER)
      .useValue(sttProvider)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterEach(() => {
    sttProvider.streamTranscribe.mockClear();
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

    await new Promise((resolve) => setTimeout(resolve, 300));
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
});
