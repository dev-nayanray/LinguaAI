import { Module } from '@nestjs/common';

import {
  resolveSpeechProviderConfig,
  SPEECH_PROVIDER_CONFIG,
  STT_PROVIDER,
  TTS_PROVIDER,
} from './speech-provider.config.js';
import { OpenAiSpeechProvider } from './openai-speech.provider.js';

/**
 * `services/speech-service`'s first real module (E10 T1, ADR-043) —
 * mirrors `ai-engine`'s own `GatewayModule` shape exactly: a config
 * factory, one concrete provider instance bound to both the `STT_PROVIDER`
 * and `TTS_PROVIDER` tokens (the same single `OpenAiSpeechProvider`
 * instance satisfies both interfaces — no need for two separate
 * instantiations). Later E10 tasks (the real-time WebSocket gateway, T3)
 * extend this module, not replace it.
 */
@Module({
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
  exports: [STT_PROVIDER, TTS_PROVIDER],
})
export class SpeechProviderModule {}
