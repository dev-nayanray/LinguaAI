import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { RateLimitModule } from './common/rate-limit/index.js';
import { DatabaseModule } from './database/index.js';
import { EventsModule } from './events/index.js';
import { HealthController } from './health/health.controller.js';
import { AiEngineClientModule } from './modules/ai-engine/ai-engine-client.module.js';
import { AssessmentModule } from './modules/assessment/index.js';
import { AuditModule } from './modules/audit/index.js';
import { AuthModule } from './modules/auth/index.js';
import { OrganizationsModule } from './modules/organizations/index.js';
import { RecommendationsModule } from './modules/recommendations/index.js';
import { UsersModule } from './modules/users/index.js';

@Module({
  imports: [
    ObservabilityModule.forRoot('api'),
    DatabaseModule,
    EventsModule,
    RateLimitModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    AssessmentModule,
    RecommendationsModule,
    AuditModule,
    AiEngineClientModule,
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
