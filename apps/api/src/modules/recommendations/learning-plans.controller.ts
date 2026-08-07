import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  currentLearningPlanQuerySchema,
  type CurrentLearningPlanQuery,
  type LearningPlanResponse,
} from '@linguaai/validation/learning';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { LearningPlansService } from './learning-plans.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/** `/v1/learning-plans*` (E7 T5, §6.6). Pure read of `recommendation-engine`'s own precomputed rows — no live computation on the request path. */
@ApiTags('learning-plans')
@Controller('learning-plans')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class LearningPlansController {
  constructor(private readonly learningPlansService: LearningPlansService) {}

  @Get('current')
  @ApiOperation({
    summary:
      "The caller's own active LearningPlan (optionally scoped by ?languageId for multi-language learners); 404 if none exists yet",
  })
  async getCurrent(
    @Req() req: JwtAuthenticatedRequest,
    @Query(new ZodValidationPipe(currentLearningPlanQuerySchema)) query: CurrentLearningPlanQuery,
  ): Promise<LearningPlanResponse> {
    return this.learningPlansService.getCurrent(req.user, query);
  }
}
