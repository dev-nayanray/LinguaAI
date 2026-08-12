import { Module } from '@nestjs/common';

import { AUDIO_STORAGE_PROVIDER, resolveAudioStorageConfig } from './audio-storage.config.js';
import { S3AudioStorageProvider } from './s3-audio-storage.provider.js';

/**
 * `services/speech-service`'s object-storage module (E10 T4, ADR-047) —
 * mirrors `SpeechProviderModule`'s own factory-provider shape exactly.
 */
@Module({
  providers: [
    {
      provide: AUDIO_STORAGE_PROVIDER,
      useFactory: () => new S3AudioStorageProvider(resolveAudioStorageConfig()),
    },
  ],
  exports: [AUDIO_STORAGE_PROVIDER],
})
export class AudioStorageModule {}
