import type { Logger } from '@linguaai/observability';
import {
  ackServerMessageSchema,
  speechEndOfTurnClientMessageSchema,
  speechTranscriptServerMessageSchema,
  type SpeechEndOfTurnClientMessage,
} from '@linguaai/validation/speaking';
import { WebSocket } from 'ws';
import type { ZodSchema } from 'zod';

import type { SttProvider, TranscriptChunk } from '../speech-provider/speech-provider.interface.js';
import { AudioChunkQueue } from './audio-chunk-queue.js';

/**
 * The minimal shape `SpeechSessionConnection` needs from a client socket —
 * deliberately narrower than `ws`'s own `WebSocket` class so this class
 * stays framework-agnostic and directly unit-testable against a plain fake,
 * without pulling in `ws`'s own handshake/protocol machinery.
 */
export interface WebSocketLike {
  send(data: string): void;
  readonly readyState: number;
}

export interface SpeechSessionConnectionDeps {
  sttProvider: SttProvider;
  logger: Logger;
}

/**
 * One instance per live WebSocket connection (T3, design doc §6.3 steps
 * 1-2). Framework-agnostic and independent of `ws`'s own handshake/upgrade
 * machinery on purpose — `SpeechSessionGateway` owns the real socket
 * lifecycle (the connection/auth boundary, only exercisable for real by a
 * genuine WebSocket handshake, T3's own e2e coverage); this class owns the
 * per-connection message-routing/business logic, directly unit-testable
 * against a plain fake client.
 *
 * Binary frames are raw audio for the *current* turn — acked immediately
 * (`{type: 'ack', payload: {forSeq}}`, API_GUIDELINES.md §9) and pushed into
 * an `AudioChunkQueue`. A `speech.end-of-turn` JSON control message closes
 * that queue and starts transcription (`SttProvider.streamTranscribe`),
 * streaming `speech.partial-transcript`/`speech.final-transcript` messages
 * back as they're yielded, then opens a fresh queue for the next turn.
 */
export class SpeechSessionConnection {
  private seq = 0;
  private currentTurn = new AudioChunkQueue();

  constructor(
    private readonly client: WebSocketLike,
    private readonly sessionId: string,
    private readonly deps: SpeechSessionConnectionDeps,
  ) {
    this.runTurn(this.currentTurn);
  }

  handleMessage(data: Buffer, isBinary: boolean): void {
    if (isBinary) {
      this.seq += 1;
      this.currentTurn.push(data);
      this.sendAck(this.seq);
      return;
    }

    const message = this.parseControlMessage(data.toString('utf8'));
    if (!message) {
      return;
    }
    if (message.type === 'speech.end-of-turn') {
      this.currentTurn.end();
      this.currentTurn = new AudioChunkQueue();
      this.runTurn(this.currentTurn);
    }
  }

  handleClose(): void {
    this.currentTurn.end();
  }

  private parseControlMessage(raw: string): SpeechEndOfTurnClientMessage | null {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const result = speechEndOfTurnClientMessageSchema.safeParse(json);
    if (!result.success || result.data.sessionId !== this.sessionId) {
      return null;
    }
    return result.data;
  }

  private runTurn(queue: AudioChunkQueue): void {
    void (async () => {
      try {
        for await (const transcript of this.deps.sttProvider.streamTranscribe(queue)) {
          this.sendTranscript(transcript);
        }
      } catch (error) {
        this.deps.logger.error(
          { err: error, sessionId: this.sessionId },
          'STT streaming failed for a speaking session turn',
        );
      }
    })();
  }

  private sendAck(forSeq: number): void {
    this.sendJson(ackServerMessageSchema, {
      type: 'ack',
      payload: { forSeq },
      sessionId: this.sessionId,
      ts: Date.now(),
    });
  }

  private sendTranscript(transcript: TranscriptChunk): void {
    this.sendJson(speechTranscriptServerMessageSchema, {
      type: transcript.isFinal ? 'speech.final-transcript' : 'speech.partial-transcript',
      payload: { text: transcript.text },
      sessionId: this.sessionId,
      ts: Date.now(),
    });
  }

  private sendJson<T>(schema: ZodSchema<T>, message: T): void {
    if (this.client.readyState !== WebSocket.OPEN) {
      return;
    }
    this.client.send(JSON.stringify(schema.parse(message)));
  }
}
