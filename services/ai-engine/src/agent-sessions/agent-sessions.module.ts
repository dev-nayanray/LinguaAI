import { Module } from '@nestjs/common';

import { OrchestratorModule } from '../orchestrator/orchestrator.module.js';
import { AgentSessionsController } from './agent-sessions.controller.js';

@Module({
  imports: [OrchestratorModule],
  controllers: [AgentSessionsController],
})
export class AgentSessionsModule {}
