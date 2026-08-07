import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AdaptiveItemSelectionService } from './adaptive-item-selection.service.js';
import { AssessmentController } from './assessment.controller.js';
import { AssessmentService } from './assessment.service.js';

/** `AssessmentModule` (E6 T2). Imports `AuthModule` for `AuthGuard('jwt')`, matching `OrganizationsModule`'s own precedent. */
@Module({
  imports: [AuthModule],
  controllers: [AssessmentController],
  providers: [AssessmentService, AdaptiveItemSelectionService],
})
export class AssessmentModule {}
