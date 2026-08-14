import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module.js';
import { RagModule } from '../rag/rag.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { ExamScoringController } from './exam-scoring.controller.js';
import { ExamScoringService } from './exam-scoring.service.js';

/**
 * `ExamScoringModule` (E19 T2, ADR-058/ADR-033) — `POST
 * /v1/exam-scoring/section`. Mirrors `WritingCoachingModule`'s own
 * composition of already-built E5 mechanisms (`GatewayModule`, `RagModule`,
 * `SafetyModule`) exactly.
 */
@Module({
  imports: [GatewayModule, RagModule, SafetyModule],
  controllers: [ExamScoringController],
  providers: [ExamScoringService],
  exports: [ExamScoringService],
})
export class ExamScoringModule {}
