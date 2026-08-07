import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { DailyGoalModule } from './daily-goal/daily-goal.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DomainEventsModule } from './domain-events/domain-events.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ObservabilityModule.forRoot('recommendation-engine'),
    DatabaseModule,
    DomainEventsModule,
    DailyGoalModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
