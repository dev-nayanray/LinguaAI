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
import type { Session } from '@linguaai/types/identity';
import {
  updateProfileRequestSchema,
  type CurrentUserResponse,
  type DeletionRequestResponse,
  type PublicUser,
  type UpdateProfileRequest,
} from '@linguaai/validation/identity';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { UsersService } from './users.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

@ApiTags('users')
@Controller('users/me')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user + profile' })
  async getCurrentUser(@Req() req: JwtAuthenticatedRequest): Promise<CurrentUserResponse> {
    return this.usersService.getCurrentUser(req.user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile (displayName/avatarUrl/locale/timezone only)' })
  async updateProfile(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) dto: UpdateProfileRequest,
  ): Promise<PublicUser> {
    return this.usersService.updateProfile(req.user.userId, dto);
  }

  @Post('deletion-request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'GDPR/CCPA erasure request' })
  async requestDeletion(@Req() req: JwtAuthenticatedRequest): Promise<DeletionRequestResponse> {
    return this.usersService.requestDeletion(req.user.userId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  async listSessions(@Req() req: JwtAuthenticatedRequest): Promise<Session[]> {
    return this.usersService.listSessions(req.user.userId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(@Req() req: JwtAuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.usersService.revokeSession(req.user.userId, id);
  }
}
