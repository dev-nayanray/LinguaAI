import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { DailyGoalsController } from './daily-goals.controller.js';
import { DailyGoalsService } from './daily-goals.service.js';
import { LearningPlansController } from './learning-plans.controller.js';
import { LearningPlansService } from './learning-plans.service.js';

/**
 * `RecommendationsModule` (E7 T5, §6.6) — the `apps/api` REST surface a
 * frontend uses to read `recommendation-engine`'s own precomputed
 * `LearningPlan`/`DailyGoal` rows. Two controllers under one module
 * (`AssessmentModule`/`OrganizationsModule`'s own one-controller-per-module
 * shape doesn't apply here — these are two distinct resources within one
 * bounded context, §6.6's own design text describes them as "a new
 * `apps/api` module," singular). Imports `AuthModule` for `AuthGuard('jwt')`,
 * matching every other guarded module's own precedent.
 */
@Module({
  imports: [AuthModule],
  controllers: [LearningPlansController, DailyGoalsController],
  providers: [LearningPlansService, DailyGoalsService],
})
export class RecommendationsModule {}
