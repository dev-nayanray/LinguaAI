import { Module } from '@nestjs/common';

import {
  PRONUNCIATION_PROVIDER,
  PRONUNCIATION_PROVIDER_CONFIG,
  resolvePronunciationProviderConfig,
} from './pronunciation-provider.config.js';
import { AzurePronunciationAssessmentProvider } from './azure-pronunciation-assessment.provider.js';
import { PronunciationScoringController } from './pronunciation-scoring.controller.js';

/**
 * `services/speech-service`'s pronunciation-scoring module (E11 T1,
 * ADR-049) — mirrors `SpeechProviderModule`'s own shape exactly (a config
 * factory, one concrete provider instance bound to a DI token).
 */
@Module({
  providers: [
    {
      provide: PRONUNCIATION_PROVIDER_CONFIG,
      useFactory: () => resolvePronunciationProviderConfig(),
    },
    {
      provide: PRONUNCIATION_PROVIDER,
      inject: [PRONUNCIATION_PROVIDER_CONFIG],
      useFactory: (config: ReturnType<typeof resolvePronunciationProviderConfig>) =>
        new AzurePronunciationAssessmentProvider(config.azureSpeechKey, config.azureSpeechRegion),
    },
  ],
  controllers: [PronunciationScoringController],
  exports: [PRONUNCIATION_PROVIDER],
})
export class PronunciationProviderModule {}
