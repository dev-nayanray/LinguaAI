import { Module } from '@nestjs/common';

import {
  resolveSpeechServiceClientConfig,
  SPEECH_SERVICE_CLIENT_CONFIG,
} from './speech-service-client.config.js';
import { SpeechServiceClientService } from './speech-service-client.service.js';

/** E11 T2's own real, first consumer — `PronunciationModule`. */
@Module({
  providers: [
    { provide: SPEECH_SERVICE_CLIENT_CONFIG, useFactory: () => resolveSpeechServiceClientConfig() },
    SpeechServiceClientService,
  ],
  exports: [SpeechServiceClientService],
})
export class SpeechServiceClientModule {}
