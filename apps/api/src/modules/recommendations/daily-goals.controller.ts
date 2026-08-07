import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { DailyGoalResponse } from '@linguaai/validation/learning';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { DailyGoalsService } from './daily-goals.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/** `/v1/daily-goals*` (E7 T5, §6.6). Pure read of `recommendation-engine`'s own precomputed rows — no live computation on the request path. */
@ApiTags('daily-goals')
@Controller('daily-goals')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class DailyGoalsController {
  constructor(private readonly dailyGoalsService: DailyGoalsService) {}

  @Get('today')
  @ApiOperation({
    summary:
      "The caller's own DailyGoal for today, resolved in their own local timezone; 404 if none has been generated yet",
  })
  async getToday(@Req() req: JwtAuthenticatedRequest): Promise<DailyGoalResponse> {
    return this.dailyGoalsService.getToday(req.user);
  }
}
