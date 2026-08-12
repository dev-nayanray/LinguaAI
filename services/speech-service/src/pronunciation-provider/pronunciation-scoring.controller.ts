import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  scorePronunciationRequestSchema,
  type PronunciationScoreResult,
  type ScorePronunciationRequest,
} from '@linguaai/validation/pronunciation';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PRONUNCIATION_PROVIDER } from './pronunciation-provider.config.js';
import type { PronunciationProvider } from './pronunciation-provider.interface.js';

/**
 * `speech-service`'s new stateless pronunciation-scoring surface (E11 T1,
 * §6.2, ADR-050) — internal-network-only, no auth guard (the same
 * "`apps/api`'s own already-authenticated request is the trust boundary"
 * reasoning `AgentSessionsController`/`AiEngineClientService`'s own
 * callers already establish). No persistence, no session state — audio
 * and a reference phrase in, a real `PronunciationScoreResult` out.
 */
@Controller('v1/pronunciation')
export class PronunciationScoringController {
  constructor(@Inject(PRONUNCIATION_PROVIDER) private readonly provider: PronunciationProvider) {}

  @Post('score')
  @HttpCode(HttpStatus.OK)
  async score(
    @Body(new ZodValidationPipe(scorePronunciationRequestSchema)) dto: ScorePronunciationRequest,
  ): Promise<PronunciationScoreResult> {
    const audio = Buffer.from(dto.audio, 'base64');
    return this.provider.scorePronunciation(audio, dto.referenceText, dto.languageCode);
  }
}
