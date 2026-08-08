import {
  Body,
  Controller,
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
  submitExerciseAttemptRequestSchema,
  type ExerciseAttemptResultResponse,
  type SubmitExerciseAttemptRequest,
} from '@linguaai/validation/content';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { ExerciseAttemptsService } from './exercise-attempts.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/** `/v1/exercises/:id/attempts` (E8 T2, §6.2). Any authenticated user — ownership is "the exercise's own course is published," not per-caller. */
@ApiTags('courses')
@Controller('exercises')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ExerciseAttemptsController {
  constructor(private readonly exerciseAttempts: ExerciseAttemptsService) {}

  @Post(':id/attempts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Submit an answer to a published Exercise, scored deterministically; SPEAKING_PROMPT is rejected (422) — out of this epic's own scope until services/speech-service (E10)",
  })
  async submitAttempt(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitExerciseAttemptRequestSchema))
    dto: SubmitExerciseAttemptRequest,
  ): Promise<ExerciseAttemptResultResponse> {
    return this.exerciseAttempts.submitAttempt(req.user, id, dto);
  }
}
