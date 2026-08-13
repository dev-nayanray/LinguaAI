import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createWritingSubmissionRequestSchema,
  type CreateWritingSubmissionRequest,
  type WritingSubmissionResponse,
} from '@linguaai/validation/ai-coaching';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { WritingService } from './writing.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/writing-submissions` (E13 T2, design doc §6.2). Any authenticated
 * learner — `AuthGuard('jwt')` only, no `ADMIN` gate, matching
 * `PronunciationModule`'s own learner-facing precedent. **No entitlement/
 * Premium gate** — the same real, tracked gap RISK_REGISTER R-96 already
 * names, not this task's own scope to close (E15's own future scope).
 */
@ApiTags('writing')
@Controller('writing-submissions')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class WritingController {
  constructor(private readonly writing: WritingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit free-form writing for RAG-grounded correction, every error explained',
  })
  async create(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(createWritingSubmissionRequestSchema))
    dto: CreateWritingSubmissionRequest,
  ): Promise<WritingSubmissionResponse> {
    return this.writing.submitWriting(req.user, dto);
  }
}
