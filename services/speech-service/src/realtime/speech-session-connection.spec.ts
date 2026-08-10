import { randomUUID } from 'node:crypto';

import type { Logger } from '@linguaai/observability';
import { WebSocket } from 'ws';

import type { SttProvider, TranscriptChunk } from '../speech-provider/speech-provider.interface.js';
import { SpeechSessionConnection, type WebSocketLike } from './speech-session-connection.js';

const UUID = randomUUID();
const OTHER_UUID = randomUUID();

function fakeClient(readyState: number = WebSocket.OPEN): WebSocketLike & { send: jest.Mock } {
  return { send: jest.fn(), readyState };
}

function fakeLogger(): Logger {
  return { info: jest.fn(), error: jest.fn() } as unknown as Logger;
}

async function* emptyAsyncIterable(): AsyncGenerator<TranscriptChunk> {}

function endOfTurnMessage(sessionId: string): Buffer {
  return Buffer.from(
    JSON.stringify({ type: 'speech.end-of-turn', payload: {}, sessionId, ts: Date.now() }),
  );
}

function sentMessages(client: { send: jest.Mock }): unknown[] {
  return client.send.mock.calls.map(([raw]) => JSON.parse(raw as string));
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SpeechSessionConnection', () => {
  it('starts a turn (calls streamTranscribe) as soon as the connection is constructed', () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest.fn().mockReturnValue(emptyAsyncIterable()),
    };
    new SpeechSessionConnection(fakeClient(), UUID, { sttProvider, logger: fakeLogger() });

    expect(sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
  });

  it('acks every binary chunk with an increasing, per-connection forSeq scoped to the sessionId', () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest.fn().mockReturnValue(emptyAsyncIterable()),
    };
    const client = fakeClient();
    const connection = new SpeechSessionConnection(client, UUID, {
      sttProvider,
      logger: fakeLogger(),
    });

    connection.handleMessage(Buffer.from('chunk-a'), true);
    connection.handleMessage(Buffer.from('chunk-b'), true);

    expect(sentMessages(client)).toEqual([
      { type: 'ack', payload: { forSeq: 1 }, sessionId: UUID, ts: expect.any(Number) },
      { type: 'ack', payload: { forSeq: 2 }, sessionId: UUID, ts: expect.any(Number) },
    ]);
  });

  it('feeds the buffered turn audio into the STT provider on end-of-turn and streams partial/final transcripts back', async () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest.fn((queue: AsyncIterable<Buffer>) => {
        return (async function* (): AsyncGenerator<TranscriptChunk> {
          const drained: Buffer[] = [];
          for await (const chunk of queue) {
            drained.push(chunk);
          }
          expect(drained).toEqual([Buffer.from('audio-chunk')]);
          yield { text: 'hola', isFinal: false };
          yield { text: 'hola amigo', isFinal: true };
        })();
      }),
    };
    const client = fakeClient();
    const connection = new SpeechSessionConnection(client, UUID, {
      sttProvider,
      logger: fakeLogger(),
    });

    connection.handleMessage(Buffer.from('audio-chunk'), true);
    connection.handleMessage(endOfTurnMessage(UUID), false);
    await flush();

    const messages = sentMessages(client);
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'speech.partial-transcript', payload: { text: 'hola' } }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'speech.final-transcript', payload: { text: 'hola amigo' } }),
    );
    // A second turn starts immediately after end-of-turn (construction's own
    // first call, plus this one).
    expect(sttProvider.streamTranscribe).toHaveBeenCalledTimes(2);
  });

  it('ignores a malformed (non-JSON) control message without throwing or acking', () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest.fn().mockReturnValue(emptyAsyncIterable()),
    };
    const client = fakeClient();
    const connection = new SpeechSessionConnection(client, UUID, {
      sttProvider,
      logger: fakeLogger(),
    });

    expect(() => connection.handleMessage(Buffer.from('not json'), false)).not.toThrow();
    expect(client.send).not.toHaveBeenCalled();
    expect(sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores a control message whose own sessionId does not match this connection', () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest.fn().mockReturnValue(emptyAsyncIterable()),
    };
    const client = fakeClient();
    const connection = new SpeechSessionConnection(client, UUID, {
      sttProvider,
      logger: fakeLogger(),
    });

    connection.handleMessage(endOfTurnMessage(OTHER_UUID), false);

    expect(sttProvider.streamTranscribe).toHaveBeenCalledTimes(1);
  });

  it('never sends a message once the client is no longer OPEN', () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest.fn().mockReturnValue(emptyAsyncIterable()),
    };
    const client = fakeClient(WebSocket.CLOSING);
    const connection = new SpeechSessionConnection(client, '6004c342-b811-4aea-a8d3-7411e4b48fcf', {
      sttProvider,
      logger: fakeLogger(),
    });

    connection.handleMessage(Buffer.from('chunk'), true);

    expect(client.send).not.toHaveBeenCalled();
  });

  it('logs, rather than throws, when the STT provider itself fails for a turn', async () => {
    const sttProvider: SttProvider = {
      name: 'openai',
      streamTranscribe: jest
        .fn()
        .mockImplementation(async function* (): AsyncGenerator<TranscriptChunk> {
          yield { text: '', isFinal: false };
          throw new Error('boom');
        }),
    };
    const logger = fakeLogger();
    new SpeechSessionConnection(fakeClient(), '6004c342-b811-4aea-a8d3-7411e4b48fcf', {
      sttProvider,
      logger,
    });

    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: '6004c342-b811-4aea-a8d3-7411e4b48fcf' }),
      'STT streaming failed for a speaking session turn',
    );
  });

  it('ends the current turn on handleClose, so a pending STT stream completes rather than hanging', async () => {
    let drainedPromise: Promise<Buffer[]> | undefined;
    const sttProvider: SttProvider = {
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
    };
    const connection = new SpeechSessionConnection(
      fakeClient(),
      '6004c342-b811-4aea-a8d3-7411e4b48fcf',
      {
        sttProvider,
        logger: fakeLogger(),
      },
    );

    connection.handleClose();

    await expect(drainedPromise).resolves.toEqual([]);
  });
});
