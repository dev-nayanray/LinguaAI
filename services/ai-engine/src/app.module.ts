import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { RegistryModule } from './agents/registry/registry.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { HealthController } from './health/health.controller.js';
import { OrchestratorModule } from './orchestrator/orchestrator.module.js';
import { PromptModule } from './prompts/prompt.module.js';

@Module({
  imports: [
    ObservabilityModule.forRoot('ai-engine'),
    GatewayModule,
    PromptModule,
    RegistryModule,
    OrchestratorModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
