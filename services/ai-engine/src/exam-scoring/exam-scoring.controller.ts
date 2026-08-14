import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  scoreExamSectionRequestSchema,
  type ExamSectionScore,
  type ScoreExamSectionRequest,
} from '@linguaai/validation/ai-coaching';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ExamScoringService } from './exam-scoring.service.js';

/**
 * ADR-033's pattern applied to exam band scoring (E19 T2, ADR-058). Same
 * trust model as `AssessmentScoringController`/`WritingCoachingController`:
 * no auth guard here — internal-network-only, `apps/api`'s own already-
 * authenticated request is the trust boundary.
 */
@ApiTags('exam-scoring')
@Controller('exam-scoring')
export class ExamScoringController {
  constructor(private readonly examScoring: ExamScoringService) {}

  @Post('section')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'RAG-grounded IELTS Writing/Speaking band scoring (0-9 scale, 0.5 steps)',
  })
  async scoreSection(
    @Body(new ZodValidationPipe(scoreExamSectionRequestSchema)) dto: ScoreExamSectionRequest,
  ): Promise<ExamSectionScore> {
    return this.examScoring.scoreSection(dto);
  }
}
