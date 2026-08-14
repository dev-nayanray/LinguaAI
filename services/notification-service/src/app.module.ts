import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { DatabaseModule } from './database/database.module.js';
import { DomainEventsModule } from './domain-events/domain-events.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ObservabilityModule.forRoot('notification-service'),
    DatabaseModule,
    DomainEventsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
