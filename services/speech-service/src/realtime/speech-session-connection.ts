import type { Logger } from '@linguaai/observability';
import {
  aiDoneServerMessageSchema,
  aiTokenServerMessageSchema,
  ackServerMessageSchema,
  speechAudioChunkServerMessageSchema,
  speechDegradedServerMessageSchema,
  speechEndOfTurnClientMessageSchema,
  speechTranscriptServerMessageSchema,
  type SpeechEndOfTurnClientMessage,
} from '@linguaai/validation/speaking';
import type {
  AgentMessageStreamEvent,
  SendAgentMessageRequest,
} from '@linguaai/validation/ai-coaching';
import { WebSocket } from 'ws';
import type { ZodSchema } from 'zod';

import type { AudioStorageProvider } from '../audio-storage/audio-storage.interface.js';
import type {
  SttProvider,
  TranscriptChunk,
  TtsProvider,
} from '../speech-provider/speech-provider.interface.js';
import { AudioChunkQueue } from './audio-chunk-queue.js';
import { SentenceChunker } from './sentence-chunker.js';

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

/** The minimal shape of `AiEngineClientService` this class needs (T4) — a plain, structurally-typed fake in tests, the same `WebSocketLike` precedent. */
export interface AiEngineClientLike {
  streamMessage(
    sessionId: string,
    input: SendAgentMessageRequest,
  ): AsyncGenerator<AgentMessageStreamEvent>;
  updateMessageAudioUrl(sessionId: string, messageId: string, audioUrl: string): Promise<void>;
}

export interface SpeechSessionConnectionDeps {
  sttProvider: SttProvider;
  ttsProvider: TtsProvider;
  aiEngineClient: AiEngineClientLike;
  audioStorage: AudioStorageProvider;
  logger: Logger;
}

const USER_AUDIO_CONTENT_TYPE = 'audio/webm';
const ASSISTANT_AUDIO_CONTENT_TYPE = 'audio/mpeg';

/**
 * One instance per live WebSocket connection (T3 §6.3 steps 1-2, T4 §6.3
 * steps 3-5). Framework-agnostic and independent of `ws`'s own handshake/
 * upgrade machinery on purpose — `SpeechSessionGateway` owns the real
 * socket lifecycle; this class owns the per-connection message-routing/
 * business logic, directly unit-testable against plain fakes.
 *
 * Full turn lifecycle: binary frames are raw audio for the *current* turn
 * (acked immediately, buffered both for STT and for the eventual S3
 * upload). A `speech.end-of-turn` control message closes that turn,
 * uploads its own raw audio (ADR-047), and starts transcription
 * (`SttProvider.streamTranscribe`) — streaming `speech.partial-transcript`/
 * `speech.final-transcript` back as usual (T3). Once a *final* transcript
 * arrives, T4 takes over: `ai-engine`'s `streamMessage` SSE is consumed
 * end to end — `ai.token` relayed live, each completed sentence
 * (`SentenceChunker`) fed to `TtsProvider.streamSynthesize` and streamed
 * back as `speech.audio-chunk`, `ai.done` relayed once text generation
 * finishes — then the accumulated synthesized audio is uploaded and
 * attached to the assistant's own `AIMessage` via a final
 * `updateMessageAudioUrl` call.
 */
export class SpeechSessionConnection {
  private seq = 0;
  private turnNumber = 0;
  private currentTurn = new AudioChunkQueue();
  private currentTurnRawAudio: Buffer[] = [];
  private currentTurnNumber = 0;

  /**
   * Once a real STT/TTS provider failure occurs, the connection degrades to
   * text-only for its own remainder (T6, §6.5) — sticky for the life of this
   * connection, never reset. `sendDegraded` is the only place this is set,
   * guaranteeing the client-facing `speech.degraded` notice is sent at most
   * once even if further provider calls keep failing afterward.
   */
  private degraded = false;

  /**
   * `runTurn` is started exactly once per queue, *at creation* — never
   * re-invoked once that queue later completes. A real, found-and-fixed
   * bug lived here: calling `runTurn` a second time in the `speech.end-of-turn`
   * branch (thinking it "kicked off" transcription for the just-completed
   * queue) actually started a *second*, concurrent `SttProvider.streamTranscribe`
   * call racing the *original*, already-running one from when that same
   * queue was created — and, once T4 wired `AiEngineClientLike.streamMessage`
   * on top, a second concurrent consumer of the *same* SSE event generator
   * (`aiEngineClient.streamMessage` mocks return one generator object;
   * `.next()` from either consumer advances the same shared sequence),
   * silently splitting `ai.token` events — and therefore synthesized audio
   * chunks — between two callers instead of one seeing all of them.
   */
  constructor(
    private readonly client: WebSocketLike,
    private readonly sessionId: string,
    private readonly deps: SpeechSessionConnectionDeps,
  ) {
    this.currentTurnNumber = this.nextTurnNumber();
    this.runTurn(this.currentTurn, this.currentTurnRawAudio, this.currentTurnNumber);
  }

  handleMessage(data: Buffer, isBinary: boolean): void {
    if (isBinary) {
      this.seq += 1;
      this.currentTurn.push(data);
      this.currentTurnRawAudio.push(data);
      this.sendAck(this.seq);
      return;
    }

    const message = this.parseControlMessage(data.toString('utf8'));
    if (!message) {
      return;
    }
    if (message.type === 'speech.end-of-turn') {
      // Ending this queue unblocks the `runTurn` call already running for
      // it (started when it was created, below) — its own `for await` loop
      // naturally drains and yields the final transcript once `end()`
      // resolves it, so nothing further needs to be done for *this* turn
      // here. Only the *next* turn's queue needs its own, brand-new
      // `runTurn` call.
      this.currentTurn.end();
      this.currentTurn = new AudioChunkQueue();
      this.currentTurnRawAudio = [];
      this.currentTurnNumber = this.nextTurnNumber();
      this.runTurn(this.currentTurn, this.currentTurnRawAudio, this.currentTurnNumber);
    }
  }

  handleClose(): void {
    this.currentTurn.end();
  }

  private nextTurnNumber(): number {
    this.turnNumber += 1;
    return this.turnNumber;
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

  /**
   * A degraded connection (T6) stops attempting transcription for the
   * remainder of the session — this queue's audio is simply drained and
   * discarded, matching §6.5's own "stops attempting audio synthesis/
   * transcription" wording. A real, honestly-flagged limitation this
   * implies (not silently glossed over): once STT has failed, this
   * WebSocket protocol has no client→server *text* message of its own
   * (§3.6 scopes the actual conversation-session UI to a later epic), so a
   * session degraded by an STT failure specifically has no further way to
   * receive new turns at all — only a TTS-only degrade leaves the
   * conversation itself still fully functional (text in, text replies out,
   * silently skipping synthesis).
   */
  private runTurn(queue: AudioChunkQueue, rawAudioChunks: Buffer[], turnNumber: number): void {
    if (this.degraded) {
      // Drained and discarded — no provider call is attempted.
      void (async () => {
        const iterator = queue[Symbol.asyncIterator]();
        for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
          // no-op
        }
      })();
      return;
    }
    void (async () => {
      try {
        for await (const transcript of this.deps.sttProvider.streamTranscribe(queue)) {
          this.sendTranscript(transcript);
          if (transcript.isFinal) {
            await this.completeTurn(transcript.text, Buffer.concat(rawAudioChunks), turnNumber);
          }
        }
      } catch (error) {
        this.deps.logger.error(
          { err: error, sessionId: this.sessionId },
          'STT streaming failed for a speaking session turn',
        );
        this.sendDegraded('stt_failure');
      }
    })();
  }

  /**
   * The T4 round trip proper — final transcript in, a real `ai-engine`
   * conversational turn out, streamed to the client and persisted with its
   * own synthesized-audio URL. A turn with no spoken audio at all (the
   * client sent `speech.end-of-turn` with nothing buffered) is a real,
   * legitimate no-op here, not an error — nothing worth sending to
   * `ai-engine` exists yet.
   */
  private async completeTurn(
    finalText: string,
    rawAudio: Buffer,
    turnNumber: number,
  ): Promise<void> {
    if (!finalText.trim()) {
      return;
    }

    const userAudioUrl =
      rawAudio.byteLength > 0
        ? (
            await this.deps.audioStorage.upload({
              key: `speaking-sessions/${this.sessionId}/${turnNumber}-user.webm`,
              body: rawAudio,
              contentType: USER_AUDIO_CONTENT_TYPE,
            })
          ).url
        : undefined;

    let messageId: string | undefined;
    const assistantAudioChunks: Buffer[] = [];
    const chunker = new SentenceChunker();

    for await (const event of this.deps.aiEngineClient.streamMessage(this.sessionId, {
      userMessage: finalText,
      variables: {},
      audioUrl: userAudioUrl,
    })) {
      if (event.type === 'token') {
        this.sendAiToken(event.delta);
        for (const sentence of chunker.push(event.delta)) {
          await this.synthesizeAndStream(sentence, assistantAudioChunks);
        }
      } else if (event.type === 'done') {
        messageId = event.messageId;
        this.sendAiDone(event.assistantMessage);
      } else {
        this.deps.logger.error(
          { sessionId: this.sessionId, message: event.message },
          'ai-engine stream reported an error mid-turn',
        );
      }
    }

    const trailing = chunker.flush();
    if (trailing) {
      await this.synthesizeAndStream(trailing, assistantAudioChunks);
    }
    if (!this.degraded) {
      this.sendAudioChunk(Buffer.alloc(0), true);
    }

    if (messageId && assistantAudioChunks.length > 0) {
      const assistantAudioUrl = (
        await this.deps.audioStorage.upload({
          key: `speaking-sessions/${this.sessionId}/${turnNumber}-assistant.mp3`,
          body: Buffer.concat(assistantAudioChunks),
          contentType: ASSISTANT_AUDIO_CONTENT_TYPE,
        })
      ).url;
      await this.deps.aiEngineClient.updateMessageAudioUrl(
        this.sessionId,
        messageId,
        assistantAudioUrl,
      );
    }
  }

  private async synthesizeAndStream(sentence: string, accumulator: Buffer[]): Promise<void> {
    if (!sentence.trim() || this.degraded) {
      return;
    }
    try {
      for await (const chunk of this.deps.ttsProvider.streamSynthesize(sentence)) {
        if (chunk.done) {
          continue;
        }
        accumulator.push(chunk.data);
        this.sendAudioChunk(chunk.data, false);
      }
    } catch (error) {
      this.deps.logger.error(
        { err: error, sessionId: this.sessionId },
        'TTS synthesis failed for a speaking session turn',
      );
      this.sendDegraded('tts_failure');
    }
  }

  /** Sent at most once per connection (T6, §6.5) — a real, honest client-facing notice, not repeated on every subsequent failed attempt. */
  private sendDegraded(reason: 'stt_failure' | 'tts_failure'): void {
    if (this.degraded) {
      return;
    }
    this.degraded = true;
    this.sendJson(speechDegradedServerMessageSchema, {
      type: 'speech.degraded',
      payload: { reason },
      sessionId: this.sessionId,
      ts: Date.now(),
    });
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

  private sendAiToken(delta: string): void {
    this.sendJson(aiTokenServerMessageSchema, {
      type: 'ai.token',
      payload: { delta },
      sessionId: this.sessionId,
      ts: Date.now(),
    });
  }

  private sendAiDone(text: string): void {
    this.sendJson(aiDoneServerMessageSchema, {
      type: 'ai.done',
      payload: { text },
      sessionId: this.sessionId,
      ts: Date.now(),
    });
  }

  private sendAudioChunk(data: Buffer, done: boolean): void {
    this.sendJson(speechAudioChunkServerMessageSchema, {
      type: 'speech.audio-chunk',
      payload: { audio: data.toString('base64'), done },
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
