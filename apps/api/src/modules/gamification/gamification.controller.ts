import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type {
  EarnedBadgeResponse,
  GamificationStatusResponse,
  MissionProgressResponse,
} from '@linguaai/validation/gamification';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { GamificationService } from './gamification.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/gamification/*` (E14 T1, design doc §6). Any authenticated
 * learner — `AuthGuard('jwt')` only, matching every other learner-facing
 * module's own precedent.
 */
@ApiTags('gamification')
@Controller('gamification')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('me')
  @ApiOperation({ summary: "The caller's own current XP, level, and streak" })
  async getStatus(@Req() req: JwtAuthenticatedRequest): Promise<GamificationStatusResponse> {
    return this.gamification.getStatus(req.user.userId);
  }

  @Get('badges')
  @ApiOperation({ summary: "The caller's own earned badges" })
  async getBadges(@Req() req: JwtAuthenticatedRequest): Promise<EarnedBadgeResponse[]> {
    return this.gamification.getBadges(req.user.userId);
  }

  @Get('missions')
  @ApiOperation({ summary: "The caller's own active missions and current progress" })
  async getMissions(@Req() req: JwtAuthenticatedRequest): Promise<MissionProgressResponse[]> {
    return this.gamification.getMissions(req.user.userId);
  }
}
