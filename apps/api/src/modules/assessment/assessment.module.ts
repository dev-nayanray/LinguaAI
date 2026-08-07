import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AdaptiveItemSelectionService } from './adaptive-item-selection.service.js';
import { AssessmentController } from './assessment.controller.js';
import { AssessmentService } from './assessment.service.js';

/**
 * `AssessmentModule` (E6 T2). Imports `AuthModule` for `AuthGuard('jwt')`,
 * matching `OrganizationsModule`'s own precedent. Imports
 * `AiEngineClientModule` (E6-T7) so `AssessmentService` can call
 * `AiEngineClientService.scoreWriting()` — the first real consumer of that
 * method, previously registered app-wide but unused (T5's own doc comment).
 */
@Module({
  imports: [AuthModule, AiEngineClientModule],
  controllers: [AssessmentController],
  providers: [AssessmentService, AdaptiveItemSelectionService],
})
export class AssessmentModule {}
