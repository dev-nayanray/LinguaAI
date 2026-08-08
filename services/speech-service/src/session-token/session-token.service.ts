import { Inject, Injectable } from '@nestjs/common';
import { verifySpeechSessionToken, type SpeechSessionTokenVerification } from '@linguaai/utils';

import { SESSION_TOKEN_CONFIG, type SessionTokenModuleConfig } from './session-token.config.js';

/**
 * Thin DI wrapper around `@linguaai/utils`'s own `verifySpeechSessionToken`
 * (E10 T1, design doc §6.2, ADR-043) — verified locally, with zero network
 * round-trip back to `apps/api`, the latency-driven reasoning §3.5 of the
 * design doc already states. The real WebSocket gateway (T3) is this
 * service's own first real caller — a client presents the token at
 * handshake against the `sessionId` named in the connection URL itself.
 */
@Injectable()
export class SessionTokenService {
  constructor(@Inject(SESSION_TOKEN_CONFIG) private readonly config: SessionTokenModuleConfig) {}

  verify(token: string, expectedSessionId: string): SpeechSessionTokenVerification {
    return verifySpeechSessionToken(token, this.config.secret, expectedSessionId);
  }
}
