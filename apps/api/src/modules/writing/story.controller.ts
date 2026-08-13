import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createStoryRequestSchema,
  type CreateStoryRequest,
  type GeneratedStoryResponse,
} from '@linguaai/validation/ai-coaching';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { StoryService } from './story.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/stories` (E13 T3, design doc §6.3). Any authenticated learner —
 * `AuthGuard('jwt')` only, matching `WritingController`'s own precedent.
 * **No entitlement/Premium gate** — the same real, tracked gap
 * RISK_REGISTER R-96 already names, not this task's own scope to close
 * (E15's own future scope).
 */
@ApiTags('writing')
@Controller('stories')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class StoryController {
  constructor(private readonly story: StoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Generate a personalized story reusing the caller's own currently-learning vocabulary",
  })
  async create(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(createStoryRequestSchema)) dto: CreateStoryRequest,
  ): Promise<GeneratedStoryResponse> {
    return this.story.generateStory(req.user, dto);
  }
}
