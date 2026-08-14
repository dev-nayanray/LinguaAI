import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DeviceToken } from '@linguaai/database';
import {
  registerDeviceTokenRequestSchema,
  type RegisterDeviceTokenRequest,
} from '@linguaai/validation/identity';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { DeviceTokensService } from './device-tokens.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

@ApiTags('notifications')
@Controller('notifications/device-tokens')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class DeviceTokensController {
  constructor(private readonly deviceTokensService: DeviceTokensService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Register (or reactivate) the caller's own push device token",
  })
  async register(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(registerDeviceTokenRequestSchema)) dto: RegisterDeviceTokenRequest,
  ): Promise<DeviceToken> {
    return this.deviceTokensService.register(req.user.userId, dto);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove the caller's own device token (sign-out/uninstall)" })
  async remove(@Req() req: JwtAuthenticatedRequest, @Param('token') token: string): Promise<void> {
    await this.deviceTokensService.remove(req.user.userId, token);
  }
}
