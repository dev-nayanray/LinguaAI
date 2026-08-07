import { Module } from '@nestjs/common';

import { LearningPlanService } from './learning-plan.service.js';

@Module({
  providers: [LearningPlanService],
  exports: [LearningPlanService],
})
export class LearningPlanModule {}
