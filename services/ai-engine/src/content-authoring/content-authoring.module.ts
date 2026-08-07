import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { ContentDraftingController } from './content-drafting.controller.js';
import { ContentDraftingService } from './content-drafting.service.js';

/**
 * `ContentAuthoringModule` (E8 T4, ADR-041). The REST surface
 * (`POST /v1/content-authoring/draft-lesson`) mirrors
 * `AssessmentScoringModule`'s own shape exactly — no `RagModule` import
 * here, unlike that module, since lesson drafting needs no grounding
 * retrieval (`ContentDraftingService`'s own doc comment has the full
 * reasoning).
 */
@Module({
  imports: [GatewayModule, SafetyModule],
  controllers: [ContentDraftingController],
  providers: [ContentDraftingService],
  exports: [ContentDraftingService],
})
export class ContentAuthoringModule {}
