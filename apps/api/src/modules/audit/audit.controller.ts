import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditLogQuerySchema,
  type AuditLogListResponse,
  type AuditLogQuery,
} from '@linguaai/validation/identity';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AuditService } from './audit.service.js';

interface JwtAuthenticatedRequest {
  user: RequestUser;
}

/**
 * `/v1/audit-log`, `/v1/organizations/:id/audit-log` (Part 6/9B, E2-T17).
 * No class-level route prefix — the two endpoints don't share one (Part 6
 * puts the org-scoped route under `/organizations`, not `/audit-log`).
 * `GET /v1/audit-log` is platform-`ADMIN`-only (`@Roles('ADMIN')`); the
 * org-scoped route is gated by "that org's `ENTERPRISE_ADMIN`, or a
 * platform `ADMIN`" — enforced in `AuditService`, the same pattern every
 * other org-scoped route in this codebase uses (`RolesGuard` can't express
 * an org-scoped role).
 */
@ApiTags('audit')
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-log')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Platform-wide audit log, filterable (platform ADMIN only)' })
  async listPlatform(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogListResponse> {
    return this.auditService.listPlatformAuditLog(query);
  }

  @Get('organizations/:id/audit-log')
  @ApiOperation({
    summary: "Org-scoped audit log (that org's ENTERPRISE_ADMIN, or a platform ADMIN)",
  })
  async listForOrganization(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogListResponse> {
    return this.auditService.listOrganizationAuditLog(req.user, id, query);
  }
}
