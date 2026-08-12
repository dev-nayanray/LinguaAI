import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { FluencyScoringController } from './fluency-scoring.controller.js';
import { FluencyScoringService } from './fluency-scoring.service.js';

@Module({
  imports: [DatabaseModule, GatewayModule, SafetyModule],
  controllers: [FluencyScoringController],
  providers: [FluencyScoringService],
})
export class FluencyScoringModule {}
