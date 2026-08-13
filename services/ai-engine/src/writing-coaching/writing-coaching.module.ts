import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module.js';
import { RagModule } from '../rag/rag.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { WritingCoachingController } from './writing-coaching.controller.js';
import { WritingCoachService } from './writing-coaching.service.js';

/**
 * `WritingCoachingModule` (E13 T1, ADR-052/ADR-033) — `POST
 * /v1/writing-coaching/correct`. Mirrors `AssessmentScoringModule`'s own
 * composition of already-built E5 mechanisms (`GatewayModule`, `RagModule`,
 * `SafetyModule`) exactly; this is `RagModule`'s first real consumer
 * outside `AssessmentScoringModule`'s own `CEFR_DESCRIPTOR` use.
 */
@Module({
  imports: [GatewayModule, RagModule, SafetyModule],
  controllers: [WritingCoachingController],
  providers: [WritingCoachService],
  exports: [WritingCoachService],
})
export class WritingCoachingModule {}
