import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { SessionTokenService } from '../session-token/session-token.service.js';
import { STT_PROVIDER } from '../speech-provider/speech-provider.config.js';
import type { SttProvider } from '../speech-provider/speech-provider.interface.js';
import { SpeechSessionConnection } from './speech-session-connection.js';

const REALTIME_PATH_PREFIX = '/realtime/speaking-sessions/';

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
 * gateway merely instantiates and wires to the real socket's events.
 */
@Injectable()
export class SpeechSessionGateway implements OnApplicationBootstrap {
  private readonly wss = new WebSocketServer({ noServer: true });

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly sessionTokens: SessionTokenService,
    @Inject(STT_PROVIDER) private readonly sttProvider: SttProvider,
    @Inject(LOGGER) private readonly logger: Logger,
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

  private handleConnection(client: WebSocket, sessionId: string, userId: string): void {
    this.logger.info({ sessionId, userId }, 'speaking session connected');
    const connection = new SpeechSessionConnection(client, sessionId, {
      sttProvider: this.sttProvider,
      logger: this.logger,
    });

    client.on('message', (data: RawData, isBinary: boolean) => {
      connection.handleMessage(toBuffer(data), isBinary);
    });

    client.on('close', () => {
      connection.handleClose();
      this.logger.info({ sessionId, userId }, 'speaking session disconnected');
    });
  }
}
