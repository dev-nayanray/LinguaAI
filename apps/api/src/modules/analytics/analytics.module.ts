import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * `GET /v1/admin/analytics/*` (E17 T2). `AuthModule` is imported only for
 * `AuthGuard('jwt')`/`RolesGuard`/`MfaGuard`'s own providers, the same
 * pattern every other `ADMIN`-gated module already follows
 * (`CourseModule`'s own doc comment).
 */
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
