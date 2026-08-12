import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createPronunciationAttemptRequestSchema,
  type CreatePronunciationAttemptRequest,
  type PronunciationAttemptResponse,
} from '@linguaai/validation/pronunciation';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PronunciationLabService } from './pronunciation-lab.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/pronunciation-attempts` (E11 T2, design doc §6.2). Any authenticated
 * learner — `AuthGuard('jwt')` only, no `ADMIN` gate, matching
 * `SpeakingModule`'s own learner-facing precedent. **No entitlement/Premium
 * gate** — a real, tracked gap (RISK_REGISTER R-96), not this task's own
 * scope to close (E15's own future scope).
 */
@ApiTags('pronunciation')
@Controller('pronunciation-attempts')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class PronunciationLabController {
  constructor(private readonly pronunciationLab: PronunciationLabService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Score a recorded attempt at a target phrase, phoneme-level' })
  async create(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(createPronunciationAttemptRequestSchema))
    dto: CreatePronunciationAttemptRequest,
  ): Promise<PronunciationAttemptResponse> {
    return this.pronunciationLab.createAttempt(req.user, dto);
  }
}
