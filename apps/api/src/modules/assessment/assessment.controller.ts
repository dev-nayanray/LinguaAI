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
  startAssessmentAttemptRequestSchema,
  submitAssessmentResponseRequestSchema,
  type CompleteAssessmentAttemptResponse,
  type StartAssessmentAttemptRequest,
  type StartAssessmentAttemptResponse,
  type SubmitAssessmentResponseRequest,
  type SubmitAssessmentResponseResponse,
} from '@linguaai/validation/learning';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AssessmentService } from './assessment.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/assessment-attempts*` (E6 T2). Attempt lifecycle only
 * (start/submit-response/complete) — the full documented REST contract
 * (every endpoint, OpenAPI-complete) is T7's own scope once T3–T6 exist;
 * this controller's three routes are real and functional today, not a
 * stub. Every route just requires a valid Bearer token — an attempt is
 * scoped to its own owner (`AssessmentService`, 404 on mismatch), not a
 * role or org, so no `RolesGuard`/`MfaGuard` applies here (unlike
 * `OrganizationsController`).
 */
@ApiTags('assessment')
@Controller('assessment-attempts')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a new placement/re-assessment attempt, returning the first item to serve',
  })
  async start(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(startAssessmentAttemptRequestSchema))
    dto: StartAssessmentAttemptRequest,
  ): Promise<StartAssessmentAttemptResponse> {
    return this.assessmentService.startAttempt(req.user, dto);
  }

  @Post(':id/responses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit a response to the currently active item, returning its score and the next item (if any)',
  })
  async submitResponse(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitAssessmentResponseRequestSchema))
    dto: SubmitAssessmentResponseRequest,
  ): Promise<SubmitAssessmentResponseResponse> {
    return this.assessmentService.submitResponse(req.user, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Complete an attempt once every objective skill has finished serving items (idempotent on repeat calls)',
  })
  async complete(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<CompleteAssessmentAttemptResponse> {
    return this.assessmentService.completeAttempt(req.user, id);
  }
}
