import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module.js';
import { RagModule } from '../rag/rag.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { AssessmentScoringController } from './assessment-scoring.controller.js';
import { AssessmentScoringService } from './assessment-scoring.service.js';

/**
 * `AssessmentScoringModule` (E6 T4/T5, ADR-039/ADR-033). The REST surface
 * (`POST /v1/assessment-scoring/writing`) lands in T5, now that E5 T10's
 * `apps/api`↔`ai-engine` contract pattern (`ZodValidationPipe`,
 * `GlobalExceptionFilter`) is merged onto this branch line.
 */
@Module({
  imports: [GatewayModule, RagModule, SafetyModule],
  controllers: [AssessmentScoringController],
  providers: [AssessmentScoringService],
  exports: [AssessmentScoringService],
})
export class AssessmentScoringModule {}
