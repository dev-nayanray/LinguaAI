import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  correctWritingRequestSchema,
  type CorrectWritingRequest,
  type WritingCorrectionResult,
} from '@linguaai/validation/ai-coaching';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { WritingCoachService } from './writing-coaching.service.js';

/**
 * ADR-033's pattern applied to writing correction (E13 T1, ADR-052). Same
 * trust model as `AssessmentScoringController`/`FluencyScoringController`:
 * no auth guard here — internal-network-only, `apps/api`'s own already-
 * authenticated request is the trust boundary.
 */
@ApiTags('writing-coaching')
@Controller('writing-coaching')
export class WritingCoachingController {
  constructor(private readonly writingCoach: WritingCoachService) {}

  @Post('correct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'RAG-grounded writing correction — every error explained, not just flagged',
  })
  async correct(
    @Body(new ZodValidationPipe(correctWritingRequestSchema)) dto: CorrectWritingRequest,
  ): Promise<WritingCorrectionResult> {
    return this.writingCoach.correctWriting(dto);
  }
}
