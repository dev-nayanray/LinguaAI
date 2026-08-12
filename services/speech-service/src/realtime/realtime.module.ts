import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine-client/ai-engine-client.module.js';
import { AudioStorageModule } from '../audio-storage/audio-storage.module.js';
import { SessionTokenModule } from '../session-token/session-token.module.js';
import { SpeechProviderModule } from '../speech-provider/speech-provider.module.js';
import { SpeechSessionGateway } from './speech-session.gateway.js';

/**
 * `services/speech-service`'s real-time WebSocket surface (E10 T3/T4,
 * ADR-045/047) — imports `SessionTokenModule` (handshake auth, T1),
 * `SpeechProviderModule` (`STT_PROVIDER`/`TTS_PROVIDER`, T1),
 * `AiEngineClientModule` (the conversational-turn round trip, T4), and
 * `AudioStorageModule` (`AUDIO_STORAGE_PROVIDER`, T4). `SpeechSessionGateway`
 * itself has no HTTP routes of its own (`@nestjs/common`'s controller model
 * doesn't apply here) — it attaches directly to the app's own HTTP server
 * via the `OnApplicationBootstrap` lifecycle hook.
 */
@Module({
  imports: [SessionTokenModule, SpeechProviderModule, AiEngineClientModule, AudioStorageModule],
  providers: [SpeechSessionGateway],
})
export class RealtimeModule {}
