import { Module } from '@nestjs/common';

import { AudioStorageModule } from '../audio-storage/audio-storage.module.js';
import {
  resolveSpeechProviderConfig,
  SPEECH_PROVIDER_CONFIG,
  STT_PROVIDER,
  TTS_PROVIDER,
} from './speech-provider.config.js';
import { OpenAiSpeechProvider } from './openai-speech.provider.js';
import { SpeechSynthesisController } from './speech-synthesis.controller.js';

/**
 * `services/speech-service`'s first real module (E10 T1, ADR-043) —
 * mirrors `ai-engine`'s own `GatewayModule` shape exactly: a config
 * factory, one concrete provider instance bound to both the `STT_PROVIDER`
 * and `TTS_PROVIDER` tokens (the same single `OpenAiSpeechProvider`
 * instance satisfies both interfaces — no need for two separate
 * instantiations). Later E10 tasks (the real-time WebSocket gateway, T3)
 * extend this module, not replace it — as does E12 T1's own
 * `SpeechSynthesisController` (`POST /v1/speech/synthesize`, ADR-051), a
 * second, stateless REST consumer of the same `TTS_PROVIDER` token
 * outside any live conversation session — it also imports
 * `AudioStorageModule` (E10 T4) so that controller can upload the
 * synthesized audio itself and return a real, hosted URL.
 */
@Module({
  imports: [AudioStorageModule],
  providers: [
    { provide: SPEECH_PROVIDER_CONFIG, useFactory: () => resolveSpeechProviderConfig() },
    {
      provide: STT_PROVIDER,
      inject: [SPEECH_PROVIDER_CONFIG],
      useFactory: (config: ReturnType<typeof resolveSpeechProviderConfig>) =>
        new OpenAiSpeechProvider(config.openAiApiKey),
    },
    {
      provide: TTS_PROVIDER,
      inject: [SPEECH_PROVIDER_CONFIG],
      useFactory: (config: ReturnType<typeof resolveSpeechProviderConfig>) =>
        new OpenAiSpeechProvider(config.openAiApiKey),
    },
  ],
  controllers: [SpeechSynthesisController],
  exports: [STT_PROVIDER, TTS_PROVIDER],
})
export class SpeechProviderModule {}
