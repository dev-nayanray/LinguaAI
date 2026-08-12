import { randomUUID } from 'node:crypto';

import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  synthesizeSpeechRequestSchema,
  type SynthesizeSpeechRequest,
  type SynthesizeSpeechResponse,
} from '@linguaai/validation/speaking';

import { AUDIO_STORAGE_PROVIDER } from '../audio-storage/audio-storage.config.js';
import type { AudioStorageProvider } from '../audio-storage/audio-storage.interface.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { TTS_PROVIDER } from './speech-provider.config.js';
import type { TtsProvider } from './speech-provider.interface.js';

const CONTENT_TYPE = 'audio/mpeg';

/**
 * `speech-service`'s second stateless REST surface (E12 T1, §6.1,
 * ADR-051) — internal-network-only, no auth guard (the same
 * "`apps/api`'s own already-authenticated request is the trust boundary"
 * reasoning `PronunciationScoringController`'s own callers already
 * establish, E11). Reuses the already-integrated `TTS_PROVIDER`
 * (ADR-043) outside any live conversation session — content-authoring is
 * a one-shot, admin-triggered operation, not a real-time WebSocket turn.
 *
 * Uploads the synthesized audio itself via `AudioStorageProvider` (E10
 * T4, ADR-047) and returns a real, already-hosted `audioUrl` — not raw
 * bytes — so `apps/api`'s own caller never needs its own S3 client;
 * `speech-service` already owns this capability end to end, the same
 * object-storage adapter `SpeechSessionConnection` already uses for
 * conversational audio.
 */
@Controller('v1/speech')
export class SpeechSynthesisController {
  constructor(
    @Inject(TTS_PROVIDER) private readonly ttsProvider: TtsProvider,
    @Inject(AUDIO_STORAGE_PROVIDER) private readonly audioStorage: AudioStorageProvider,
  ) {}

  @Post('synthesize')
  @HttpCode(HttpStatus.OK)
  async synthesize(
    @Body(new ZodValidationPipe(synthesizeSpeechRequestSchema)) dto: SynthesizeSpeechRequest,
  ): Promise<SynthesizeSpeechResponse> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.ttsProvider.streamSynthesize(dto.text)) {
      if (!chunk.done) {
        chunks.push(chunk.data);
      }
    }

    const { url } = await this.audioStorage.upload({
      key: `content-authoring/synthesized/${randomUUID()}.mp3`,
      body: Buffer.concat(chunks),
      contentType: CONTENT_TYPE,
    });
    return { audioUrl: url };
  }
}
