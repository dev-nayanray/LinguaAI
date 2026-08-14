import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  analyticsDateRangeQuerySchema,
  cefrProgressionQuerySchema,
  type AiCostResponse,
  type AnalyticsDateRangeQuery,
  type CefrProgressionQuery,
  type CefrProgressionResponse,
} from '@linguaai/validation/analytics';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * `GET /v1/admin/analytics/*` (E17 T2, design doc §5) — `ADMIN`-only,
 * mirroring `CourseModule`'s own already-established authoring-endpoint
 * pattern exactly (`AuthGuard('jwt')` + `RolesGuard` + `MfaGuard` +
 * `@Roles('ADMIN')`), the same reuse-not-reinvent reasoning design doc
 * §3.6 already gives — no admin module/dashboard-auth convention exists
 * yet to align with instead.
 */
@ApiTags('admin-analytics')
@Controller('admin/analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('cefr-progression')
  @ApiOperation({ summary: 'Cohort CEFR-level progression rate, per skill (PRD.md §5.1)' })
  async getCefrProgression(
    @Query(new ZodValidationPipe(cefrProgressionQuerySchema)) query: CefrProgressionQuery,
  ): Promise<CefrProgressionResponse> {
    return this.analyticsService.getCefrProgression(query);
  }

  @Get('ai-cost')
  @ApiOperation({ summary: 'AI cost breakdown by agent persona and model' })
  async getAiCost(
    @Query(new ZodValidationPipe(analyticsDateRangeQuerySchema)) query: AnalyticsDateRangeQuery,
  ): Promise<AiCostResponse> {
    return this.analyticsService.getAiCost(query);
  }
}
