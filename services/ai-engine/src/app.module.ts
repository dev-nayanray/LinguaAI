import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { AgentSessionsModule } from './agent-sessions/agent-sessions.module.js';
import { RegistryModule } from './agents/registry/registry.module.js';
import { AssessmentScoringModule } from './assessment-scoring/assessment-scoring.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { ContentAuthoringModule } from './content-authoring/content-authoring.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { HealthController } from './health/health.controller.js';
import { MemoryModule } from './memory/memory.module.js';
import { OrchestratorModule } from './orchestrator/orchestrator.module.js';
import { PartitionMaintenanceModule } from './partition-maintenance/partition-maintenance.module.js';
import { PromptModule } from './prompts/prompt.module.js';
import { RagModule } from './rag/rag.module.js';
import { SafetyModule } from './safety/safety.module.js';

@Module({
  imports: [
    ObservabilityModule.forRoot('ai-engine'),
    GatewayModule,
    PromptModule,
    RegistryModule,
    MemoryModule,
    RagModule,
    SafetyModule,
    OrchestratorModule,
    AssessmentScoringModule,
    ContentAuthoringModule,
    AgentSessionsModule,
    PartitionMaintenanceModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
