import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  initiateRoleChangeRequestSchema,
  type InitiateRoleChangeRequest,
  type RoleChangeRequestResponse,
} from '@linguaai/validation/identity';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { RoleLifecycleService } from './role-lifecycle.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/users/:id/role-change-requests*` (Part 6/9A, E2-T16) — every route
 * requires platform `ADMIN` (`@Roles('ADMIN')`); `RoleLifecycleService`
 * itself enforces "approver must differ from requester" (via
 * `approve_role_change()`'s own check) and the two-person/single-party
 * split.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class RoleChangeRequestsController {
  constructor(private readonly roleLifecycleService: RoleLifecycleService) {}

  @Post(':id/role-change-requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate a role change (auto-approved unless it touches the ADMIN tier)',
  })
  async initiate(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(initiateRoleChangeRequestSchema)) dto: InitiateRoleChangeRequest,
  ): Promise<RoleChangeRequestResponse> {
    return this.roleLifecycleService.initiateRoleChange(req.user, id, dto.toRole);
  }

  @Post(':id/role-change-requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve a pending ADMIN-involving role change (must be a different ADMIN than the requester)',
  })
  async approve(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ): Promise<RoleChangeRequestResponse> {
    return this.roleLifecycleService.approveRoleChange(req.user, id, requestId);
  }
}
