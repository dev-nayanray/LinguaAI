import { Module } from '@nestjs/common';

import { CostModule } from '../cost/cost.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { PromptModule } from '../prompts/prompt.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { OrchestratorService } from './orchestrator.service.js';
import { RollingSummaryCache } from './rolling-summary.cache.js';

@Module({
  imports: [DatabaseModule, GatewayModule, PromptModule, MemoryModule, SafetyModule, CostModule],
  providers: [OrchestratorService, RollingSummaryCache],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
