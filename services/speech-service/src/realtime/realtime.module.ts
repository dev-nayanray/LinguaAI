import { Module } from '@nestjs/common';

import { SessionTokenModule } from '../session-token/session-token.module.js';
import { SpeechProviderModule } from '../speech-provider/speech-provider.module.js';
import { SpeechSessionGateway } from './speech-session.gateway.js';

/**
 * `services/speech-service`'s real-time WebSocket surface (E10 T3, ADR-045)
 * — imports `SessionTokenModule` (handshake auth, T1) and
 * `SpeechProviderModule` (`STT_PROVIDER`, T1); `SpeechSessionGateway` itself
 * has no HTTP routes of its own (`@nestjs/common`'s controller model doesn't
 * apply here) — it attaches directly to the app's own HTTP server via the
 * `OnApplicationBootstrap` lifecycle hook.
 */
@Module({
  imports: [SessionTokenModule, SpeechProviderModule],
  providers: [SpeechSessionGateway],
})
export class RealtimeModule {}
