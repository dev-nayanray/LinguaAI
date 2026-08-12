import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  scoreFluencyRequestSchema,
  type ScoreFluencyRequest,
  type ScoreFluencyResponse,
} from '@linguaai/validation/ai-coaching';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { FluencyScoringService } from './fluency-scoring.service.js';

/**
 * ADR-033's internal-trust pattern applied to session-end fluency scoring
 * (E10 T5) — no auth guard here, internal-network-only, `apps/api`'s own
 * already-authenticated request is the trust boundary, the same shape
 * `AssessmentScoringController`/`AgentSessionsController` already carry.
 * Wired into `apps/api`'s `SpeakingService.endSession()` (E10 T2), called
 * after the underlying `AIAgentSession` is marked `ENDED`.
 */
@ApiTags('fluency-scoring')
@Controller('fluency-scoring')
export class FluencyScoringController {
  constructor(private readonly fluencyScoring: FluencyScoringService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Score a completed speaking session's fluency and extract notable vocabulary",
  })
  async score(
    @Body(new ZodValidationPipe(scoreFluencyRequestSchema)) dto: ScoreFluencyRequest,
  ): Promise<ScoreFluencyResponse> {
    return this.fluencyScoring.scoreSessionAndExtractVocabulary(dto.sessionId);
  }
}
