import { EventEmitter } from 'node:events';

import type { HttpAdapterHost } from '@nestjs/core';
import type { Logger } from '@linguaai/observability';
import type { SpeechSessionTokenVerification } from '@linguaai/utils';

import type { SttProvider } from '../speech-provider/speech-provider.interface.js';
import type { SessionTokenService } from '../session-token/session-token.service.js';
import { SpeechSessionGateway } from './speech-session.gateway.js';

function fakeHttpAdapterHost(): { httpAdapterHost: HttpAdapterHost; httpServer: EventEmitter } {
  const httpServer = new EventEmitter();
  const httpAdapterHost = {
    httpAdapter: { getHttpServer: () => httpServer },
  } as unknown as HttpAdapterHost;
  return { httpAdapterHost, httpServer };
}

function fakeSocket(): { write: jest.Mock; destroy: jest.Mock } {
  return { write: jest.fn(), destroy: jest.fn() };
}

function fakeLogger(): Logger {
  return { info: jest.fn(), error: jest.fn() } as unknown as Logger;
}

function fakeSttProvider(): SttProvider {
  return { name: 'openai', streamTranscribe: jest.fn() };
}

describe('SpeechSessionGateway', () => {
  function build(sessionTokens: Pick<SessionTokenService, 'verify'>): {
    gateway: SpeechSessionGateway;
    httpServer: EventEmitter;
  } {
    const { httpAdapterHost, httpServer } = fakeHttpAdapterHost();
    const gateway = new SpeechSessionGateway(
      httpAdapterHost,
      sessionTokens as SessionTokenService,
      fakeSttProvider(),
      fakeLogger(),
    );
    gateway.onApplicationBootstrap();
    return { gateway, httpServer };
  }

  it('rejects an upgrade to a non-matching path with 404, never verifying a token', () => {
    const verify = jest.fn();
    const { httpServer } = build({ verify });
    const socket = fakeSocket();

    httpServer.emit('upgrade', { url: '/not-realtime' }, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('404'));
    expect(socket.destroy).toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects an upgrade with no sessionId segment with 404', () => {
    const verify = jest.fn();
    const { httpServer } = build({ verify });
    const socket = fakeSocket();

    httpServer.emit('upgrade', { url: '/realtime/speaking-sessions/' }, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('404'));
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects an upgrade with no token query param with 404', () => {
    const verify = jest.fn();
    const { httpServer } = build({ verify });
    const socket = fakeSocket();

    httpServer.emit(
      'upgrade',
      { url: '/realtime/speaking-sessions/session-1' },
      socket,
      Buffer.alloc(0),
    );

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('404'));
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects an upgrade with an invalid token with 401, verified against the path sessionId', () => {
    const verify = jest.fn().mockReturnValue({ valid: false, reason: 'invalid-signature' });
    const { httpServer } = build({ verify });
    const socket = fakeSocket();

    httpServer.emit(
      'upgrade',
      { url: '/realtime/speaking-sessions/session-1?token=bad' },
      socket,
      Buffer.alloc(0),
    );

    expect(verify).toHaveBeenCalledWith('bad', 'session-1');
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('proceeds to the real WebSocket handshake once the token verifies for the path sessionId', () => {
    const verification: SpeechSessionTokenVerification = {
      valid: true,
      claims: { sessionId: 'session-1', userId: 'user-1' },
    };
    const verify = jest.fn().mockReturnValue(verification);
    const { gateway, httpServer } = build({ verify });
    // Narrow, spy-only use of the internal `wss` field -- the real
    // handshake itself needs a genuine HTTP upgrade request/duplex socket,
    // exercised for real only by the e2e suite; this test only proves the
    // gateway's own auth-routing reaches that point, not `ws`'s own
    // protocol handling.
    const handleUpgradeSpy = jest
      .spyOn((gateway as any).wss, 'handleUpgrade')
      .mockImplementation(() => {});
    const socket = fakeSocket();
    const head = Buffer.alloc(0);
    const request = { url: '/realtime/speaking-sessions/session-1?token=good' };

    httpServer.emit('upgrade', request, socket, head);

    expect(handleUpgradeSpy).toHaveBeenCalledWith(request, socket, head, expect.any(Function));
    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
  });
});
