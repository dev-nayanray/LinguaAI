import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { GatewayModule } from './gateway/gateway.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ObservabilityModule.forRoot('ai-engine'), GatewayModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
