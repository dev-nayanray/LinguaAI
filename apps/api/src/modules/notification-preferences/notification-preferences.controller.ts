import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  updateNotificationPreferenceRequestSchema,
  type NotificationPreference,
  type UpdateNotificationPreferenceRequest,
} from '@linguaai/validation/notification';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

@ApiTags('notification-preferences')
@Controller('notification-preferences')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class NotificationPreferencesController {
  constructor(private readonly notificationPreferencesService: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({
    summary: "The caller's own current per-channel, per-type notification preferences",
  })
  async getPreferences(@Req() req: JwtAuthenticatedRequest): Promise<NotificationPreference[]> {
    return this.notificationPreferencesService.getPreferences(req.user.userId);
  }

  @Put()
  @ApiOperation({
    summary: 'Upserts one preference row; publishes notification.preference.changed',
  })
  async updatePreference(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(updateNotificationPreferenceRequestSchema))
    dto: UpdateNotificationPreferenceRequest,
  ): Promise<NotificationPreference> {
    return this.notificationPreferencesService.updatePreference(req.user.userId, dto);
  }
}
