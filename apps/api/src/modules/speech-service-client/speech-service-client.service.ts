import { Inject, Injectable } from '@nestjs/common';
import type { SpeechServiceClientEnv } from '@linguaai/config';
import {
  pronunciationScoreResultSchema,
  scorePronunciationRequestSchema,
  type PronunciationScoreResult,
} from '@linguaai/validation/pronunciation';
import {
  synthesizeSpeechRequestSchema,
  synthesizeSpeechResponseSchema,
} from '@linguaai/validation/speaking';

import { SPEECH_SERVICE_CLIENT_CONFIG } from './speech-service-client.config.js';

/**
 * `apps/api`'s first-ever direct HTTP client to `speech-service` (E11 T2,
 * ADR-050) — previously `apps/api` only ever minted a token for the
 * *client* to connect to `speech-service` directly (E10 T2, ADR-043).
 * Internal-network-only, no auth header — the same trust-boundary
 * reasoning `AiEngineClientService`'s own callers already document.
 */
@Injectable()
export class SpeechServiceClientService {
  constructor(
    @Inject(SPEECH_SERVICE_CLIENT_CONFIG) private readonly config: SpeechServiceClientEnv,
  ) {}

  async scorePronunciation(
    audioBase64: string,
    referenceText: string,
    languageCode: string,
  ): Promise<PronunciationScoreResult> {
    const response = await fetch(`${this.config.SPEECH_SERVICE_URL}/v1/pronunciation/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        scorePronunciationRequestSchema.parse({
          audio: audioBase64,
          referenceText,
          languageCode,
        }),
      ),
    });
    if (!response.ok) {
      throw new Error(`speech-service returned ${response.status} scoring a pronunciation attempt`);
    }
    return pronunciationScoreResultSchema.parse(await response.json());
  }

  /**
   * E12 T1 (ADR-051) — `apps/api`'s content-authoring flow's own real
   * consumer, synthesizing a drafted Listening activity's script into
   * real, already-uploaded audio. `speech-service` owns the S3 upload
   * itself (it already has `AudioStorageProvider`, E10 T4) and returns
   * the real `audioUrl` directly — `apps/api` needs no S3 client of its
   * own for this.
   */
  async synthesizeSpeech(text: string): Promise<string> {
    const response = await fetch(`${this.config.SPEECH_SERVICE_URL}/v1/speech/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(synthesizeSpeechRequestSchema.parse({ text })),
    });
    if (!response.ok) {
      throw new Error(`speech-service returned ${response.status} synthesizing speech`);
    }
    return synthesizeSpeechResponseSchema.parse(await response.json()).audioUrl;
  }
}
