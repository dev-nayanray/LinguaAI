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
import type { Request } from 'express';
import {
  startSpeakingSessionRequestSchema,
  type StartSpeakingSessionRequest,
  type StartSpeakingSessionResponse,
} from '@linguaai/validation/speaking';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { SpeakingService } from './speaking.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/speaking-sessions*` (E10 T2, design doc §6.2). Any authenticated
 * learner — `AuthGuard('jwt')` only, no `ADMIN` gate, matching
 * `AssessmentModule`'s own learner-facing precedent: a session is scoped to
 * its own owner, not a role.
 */
@ApiTags('speaking')
@Controller('speaking-sessions')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class SpeakingController {
  constructor(private readonly speakingService: SpeakingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Start a new speaking-practice session, returning a short-lived speech-service connection token',
  })
  async start(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(startSpeakingSessionRequestSchema))
    dto: StartSpeakingSessionRequest,
  ): Promise<StartSpeakingSessionResponse> {
    return this.speakingService.startSession(req.user, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End a speaking-practice session' })
  async end(@Req() req: JwtAuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.speakingService.endSession(req.user, id);
  }
}
