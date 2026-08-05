import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  addOrganizationMembersRequestSchema,
  changeOrgMemberRoleRequestSchema,
  createOrganizationRequestSchema,
  type AddOrganizationMembersRequest,
  type AddOrganizationMembersResponse,
  type ChangeOrgMemberRoleRequest,
  type CreateOrganizationRequest,
  type OrganizationDetailResponse,
} from '@linguaai/validation/identity';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { RoleLifecycleService } from '../users/index.js';
import { OrganizationsService } from './organizations.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/organizations*` (Part 6, E2-T15/T16) — the first real business route
 * wired behind `RolesGuard`/`MfaGuard` (both built in E2-T14, exported
 * unused until now). Every route requires a valid Bearer token; `POST /`
 * additionally requires platform `ADMIN` (`@Roles('ADMIN')`); the other
 * routes (including `PATCH .../role`, E2-T16) are gated by "that org's
 * `ENTERPRISE_ADMIN`, or a platform `ADMIN`" — an org-scoped check
 * `RolesGuard` can't express, enforced in `OrganizationsService`/
 * `RoleLifecycleService` instead (see their own doc comments).
 */
@ApiTags('organizations')
@Controller('organizations')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly roleLifecycleService: RoleLifecycleService,
  ) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create an organization and designate its first ENTERPRISE_ADMIN (platform ADMIN only)',
  })
  async create(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(createOrganizationRequestSchema)) dto: CreateOrganizationRequest,
  ): Promise<OrganizationDetailResponse> {
    return this.organizationsService.createOrganization(req.user, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: "Organization detail (that org's ENTERPRISE_ADMIN, or a platform ADMIN)",
  })
  async get(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<OrganizationDetailResponse> {
    return this.organizationsService.getOrganization(req.user, id);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add one or more members (also accepts CSV-derived bulk import as a JSON array)',
  })
  async addMembers(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addOrganizationMembersRequestSchema))
    dto: AddOrganizationMembersRequest,
  ): Promise<AddOrganizationMembersResponse> {
    return this.organizationsService.addMembers(req.user, id, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove a member (blocked if they are the org's last ENTERPRISE_ADMIN)",
  })
  async removeMember(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(req.user, id, userId);
  }

  @Patch(':id/members/:userId/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Promote/demote a member's orgRole (blocked if it would leave the org with zero ENTERPRISE_ADMIN)",
  })
  async changeMemberRole(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(changeOrgMemberRoleRequestSchema)) dto: ChangeOrgMemberRoleRequest,
  ): Promise<void> {
    await this.roleLifecycleService.changeOrgMemberRole(req.user, id, userId, dto.orgRole);
  }
}
