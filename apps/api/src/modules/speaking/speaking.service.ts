import { Inject, Injectable } from '@nestjs/common';
import { signSpeechSessionToken } from '@linguaai/utils';
import type {
  StartSpeakingSessionRequest,
  StartSpeakingSessionResponse,
} from '@linguaai/validation/speaking';

import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import {
  SPEECH_SESSION_TOKEN_CONFIG,
  type SpeechSessionTokenModuleConfig,
} from './speaking-session-token.config.js';

/**
 * Design doc §6.2's own named TTL. Named as its own constant here rather
 * than relying on `signSpeechSessionToken`'s default parameter, so the
 * signed token's own `exp` and this response's `expiresInSeconds` field can
 * never silently drift apart if that default is ever changed for an
 * unrelated reason.
 */
const SESSION_TOKEN_TTL_SECONDS = 60;

/**
 * `SpeakingModule` (E10 T2, design doc §6.2). Learner-facing session
 * lifecycle only — the real-time WebSocket round trip itself is
 * `speech-service`'s own scope (T3+); this service's job ends at minting
 * the token that authorizes that later connection.
 */
@Injectable()
export class SpeakingService {
  constructor(
    private readonly aiEngineClient: AiEngineClientService,
    @Inject(SPEECH_SESSION_TOKEN_CONFIG)
    private readonly tokenConfig: SpeechSessionTokenModuleConfig,
  ) {}

  /**
   * Creates a real `AIAgentSession` (`orchestratorAgent: CONVERSATION_PARTNER`,
   * never client-supplied) via `AiEngineClientService.startSession()` — its
   * first real caller (previously registered app-wide but unconsumed). The
   * returned token authorizes the client's direct WebSocket connection to
   * `speech-service` (ADR-043) — this endpoint mints it but never verifies
   * it itself; verification happens locally at `speech-service` (T1's
   * `SessionTokenService`).
   */
  async startSession(
    caller: RequestUser,
    dto: StartSpeakingSessionRequest,
  ): Promise<StartSpeakingSessionResponse> {
    const { sessionId } = await this.aiEngineClient.startSession({
      userId: caller.userId,
      languageId: dto.languageId,
      orchestratorAgent: 'CONVERSATION_PARTNER',
    });

    const token = signSpeechSessionToken(
      { sessionId, userId: caller.userId },
      this.tokenConfig.secret,
      SESSION_TOKEN_TTL_SECONDS,
    );

    return { sessionId, token, expiresInSeconds: SESSION_TOKEN_TTL_SECONDS };
  }

  /**
   * Ownership is enforced by `AiEngineClientService.endSession()` itself
   * (E10 T2's own extension of ai-engine's `endSession` — 404s on a
   * mismatch), not duplicated here — the caller's own `userId` is simply
   * forwarded, closing a real hole a blind sessionId-only forward would
   * otherwise leave open (any authenticated learner could end any other
   * learner's active session by guessing/observing its UUID).
   */
  async endSession(caller: RequestUser, sessionId: string): Promise<void> {
    await this.aiEngineClient.endSession(sessionId, caller.userId);
  }
}
