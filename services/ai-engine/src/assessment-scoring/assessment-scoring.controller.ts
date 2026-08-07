import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  scoreWritingRequestSchema,
  type ScoreWritingRequest,
  type WritingCritiqueSchema,
} from '@linguaai/validation/ai-coaching';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AssessmentScoringService } from './assessment-scoring.service.js';

/**
 * ADR-033's pattern applied to Writing-skill scoring (E6 T5). Same trust
 * model as `AgentSessionsController` (T10): no auth guard here —
 * internal-network-only, `apps/api`'s own already-authenticated request is
 * the trust boundary. `apps/api`'s `AssessmentModule` does not call this
 * yet — wiring it into the attempt lifecycle (adding `WRITING` back into
 * the skill-serving order, folding its AI-determined CEFR level into
 * `completeAttempt`'s `proficiencyLevels`) is E6 T6/T7's own scope, per
 * this task's dependency list (T2, T4 — not T3's banding logic).
 */
@ApiTags('assessment-scoring')
@Controller('assessment-scoring')
export class AssessmentScoringController {
  constructor(private readonly assessmentScoring: AssessmentScoringService) {}

  @Post('writing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Score a Writing-skill placement-test response (RAG-grounded, CEFR-banded)',
  })
  async scoreWriting(
    @Body(new ZodValidationPipe(scoreWritingRequestSchema)) dto: ScoreWritingRequest,
  ): Promise<WritingCritiqueSchema> {
    return this.assessmentScoring.scoreWritingResponse(dto);
  }
}
