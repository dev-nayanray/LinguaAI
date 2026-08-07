import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module.js';
import { RagModule } from '../rag/rag.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { AssessmentScoringService } from './assessment-scoring.service.js';

/**
 * `AssessmentScoringModule` (E6 T4, ADR-039). No controller yet — the REST
 * surface (`POST /v1/assessment-scoring/writing`) is E6 T5's own scope,
 * once E5 T10's `apps/api`↔`ai-engine` contract pattern is available on
 * this branch line (RISK_REGISTER R-82). Registered in `AppModule` now
 * regardless, matching `RagModule`/`SafetyModule`'s own precedent (every
 * feature module is imported whether or not it currently exposes a
 * controller).
 */
@Module({
  imports: [GatewayModule, RagModule, SafetyModule],
  providers: [AssessmentScoringService],
  exports: [AssessmentScoringService],
})
export class AssessmentScoringModule {}
