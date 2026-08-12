import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { AiEngineClientService } from '../ai-engine-client/ai-engine-client.service.js';
import { AUDIO_STORAGE_PROVIDER } from '../audio-storage/audio-storage.config.js';
import type { AudioStorageProvider } from '../audio-storage/audio-storage.interface.js';
import { SessionTokenService } from '../session-token/session-token.service.js';
import { STT_PROVIDER, TTS_PROVIDER } from '../speech-provider/speech-provider.config.js';
import type { SttProvider, TtsProvider } from '../speech-provider/speech-provider.interface.js';
import { SpeechSessionConnection } from './speech-session-connection.js';

const REALTIME_PATH_PREFIX = '/realtime/speaking-sessions/';

/**
 * T7 (§6.5, API_GUIDELINES.md §9) — how long a dropped WebSocket may be
 * resumed by `sessionId` before its underlying `AIAgentSession` is
 * abandoned. A DI value provider (`RealtimeModule`), not an env-driven
 * config schema entry — this is a fixed protocol constant the spec itself
 * names, not an operator-tunable value — kept overridable only so tests
 * don't have to wait 60 real seconds to exercise the abandon path.
 */
export const RECONNECTION_GRACE_WINDOW_MS = Symbol('RECONNECTION_GRACE_WINDOW_MS');

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(data);
}

interface ConnectionRequest {
  sessionId: string;
  token: string;
}

/**
 * `services/speech-service`'s real-time WebSocket gateway — the connection/
 * auth boundary (T3, design doc §6.3 steps 1-2; ADR-045). Terminates
 * `/realtime/speaking-sessions/:sessionId` directly on the app's own HTTP
 * server via a manual `'upgrade'` listener rather than `@nestjs/websockets`'
 * Gateway abstraction or Socket.IO (ADR-045: dynamic per-connection auth —
 * the T1/T2 short-lived token, verified *before* the WebSocket handshake
 * completes, never after — and a binary-audio/JSON-control frame split
 * neither abstraction models well). Per-connection message routing/business
 * logic lives in `SpeechSessionConnection`, a framework-agnostic class this
 * gateway merely instantiates and wires to the real socket's events —
 * `TTS_PROVIDER`/`AiEngineClientService`/`AUDIO_STORAGE_PROVIDER` (T4) are
 * this gateway's own dependencies too, just passed straight through.
 */
interface LiveConnection {
  connection: SpeechSessionConnection;
  userId: string;
  abandonTimer: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class SpeechSessionGateway implements OnApplicationBootstrap {
  private readonly wss = new WebSocketServer({ noServer: true });

  /**
   * Keyed by `sessionId`, not per-socket — the whole point of T7's
   * reconnection support is that a `sessionId` can outlive any one
   * physical socket. Entries are removed either once the grace-window
   * timer truly fires (abandoned) or never re-added once resumed (the
   * same entry's `abandonTimer` is just cleared and its `connection`
   * rebound to the new socket).
   */
  private readonly liveConnections = new Map<string, LiveConnection>();

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly sessionTokens: SessionTokenService,
    @Inject(STT_PROVIDER) private readonly sttProvider: SttProvider,
    @Inject(TTS_PROVIDER) private readonly ttsProvider: TtsProvider,
    private readonly aiEngineClient: AiEngineClientService,
    @Inject(AUDIO_STORAGE_PROVIDER) private readonly audioStorage: AudioStorageProvider,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(RECONNECTION_GRACE_WINDOW_MS) private readonly graceWindowMs: number,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    httpServer.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      this.handleUpgrade(request, socket, head);
    });
  }

  private handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
    const parsed = this.parseConnectionRequest(request);
    if (!parsed) {
      this.rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    const verification = this.sessionTokens.verify(parsed.token, parsed.sessionId);
    if (!verification.valid) {
      this.rejectUpgrade(socket, 401, 'Unauthorized');
      return;
    }

    const { sessionId } = parsed;
    const { userId } = verification.claims;
    this.wss.handleUpgrade(request, socket, head, (client) => {
      this.handleConnection(client, sessionId, userId);
    });
  }

  /**
   * A complete, well-formed HTTP response (status line + `Connection: close`
   * + `Content-Length: 0` + terminating blank line) — not just a bare status
   * line — so a client's own HTTP parser (e.g. the `ws` npm client's
   * `unexpected-response` handling) can recognize it as a real, finished
   * response rather than a truncated one, before the socket is destroyed.
   */
  private rejectUpgrade(socket: Socket, status: number, statusText: string): void {
    socket.write(
      `HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
    socket.destroy();
  }

  private parseConnectionRequest(request: IncomingMessage): ConnectionRequest | null {
    if (!request.url) {
      return null;
    }
    const url = new URL(request.url, 'http://internal');
    if (!url.pathname.startsWith(REALTIME_PATH_PREFIX)) {
      return null;
    }
    const sessionId = url.pathname.slice(REALTIME_PATH_PREFIX.length);
    if (!sessionId || sessionId.includes('/')) {
      return null;
    }
    const token = url.searchParams.get('token');
    if (!token) {
      return null;
    }
    return { sessionId, token };
  }

  /**
   * A reconnect within the grace window (a `sessionId` already present in
   * `liveConnections`) resumes the *same* `SpeechSessionConnection`
   * instance rather than starting a new one (T7, §6.5) — cancels the
   * pending abandon timer and rebinds outbound messages to this new
   * socket. Otherwise, a genuinely new connection is created and
   * registered as usual.
   */
  private handleConnection(client: WebSocket, sessionId: string, userId: string): void {
    const existing = this.liveConnections.get(sessionId);
    if (existing) {
      if (existing.abandonTimer) {
        clearTimeout(existing.abandonTimer);
        existing.abandonTimer = null;
      }
      this.logger.info(
        { sessionId, userId },
        'speaking session resumed within the reconnection grace window',
      );
      existing.connection.rebindClient(client);
      this.wireSocket(client, existing, sessionId, userId);
      return;
    }

    this.logger.info({ sessionId, userId }, 'speaking session connected');
    const connection = new SpeechSessionConnection(client, sessionId, {
      sttProvider: this.sttProvider,
      ttsProvider: this.ttsProvider,
      aiEngineClient: this.aiEngineClient,
      audioStorage: this.audioStorage,
      logger: this.logger,
    });
    const live: LiveConnection = { connection, userId, abandonTimer: null };
    this.liveConnections.set(sessionId, live);
    this.wireSocket(client, live, sessionId, userId);
  }

  /**
   * On close, this socket's own event listeners are already spent — the
   * grace-window timer here is what actually decides this connection's
   * fate, not `handleClose()` (now a deliberate no-op, T7). If the window
   * elapses with no reconnect, the current turn is really ended
   * (`abandon()`) and `ai-engine` is told to mark the session `ABANDONED`
   * — a failure to reach `ai-engine` for that call is logged, not thrown
   * (there is no request/response cycle left to propagate an error to).
   */
  private wireSocket(
    client: WebSocket,
    live: LiveConnection,
    sessionId: string,
    userId: string,
  ): void {
    client.on('message', (data: RawData, isBinary: boolean) => {
      live.connection.handleMessage(toBuffer(data), isBinary);
    });

    client.on('close', () => {
      live.connection.handleClose();
      this.logger.info(
        { sessionId, userId },
        'speaking session socket closed -- starting reconnection grace window',
      );
      live.abandonTimer = setTimeout(() => {
        this.liveConnections.delete(sessionId);
        live.connection.abandon();
        this.aiEngineClient.abandonSession(sessionId, userId).catch((err: unknown) => {
          this.logger.error(
            { err, sessionId, userId },
            'failed to mark an unresumed speaking session ABANDONED',
          );
        });
      }, this.graceWindowMs);
    });
  }
}
