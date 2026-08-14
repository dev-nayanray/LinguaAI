import {
  Body,
  Controller,
  Get,
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
  startMockTestAttemptRequestSchema,
  submitSectionResponseRequestSchema,
  type MockTestAttemptResponse,
  type MockTestSectionScoreResponse,
  type StartMockTestAttemptRequest,
  type StartMockTestAttemptResponse,
  type SubmitSectionResponseRequest,
} from '@linguaai/validation/exams';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { MockTestAttemptsService } from './mock-test-attempts.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/mock-test-attempts*` (E19 T1, design doc §3.4/§5). Every route just
 * requires a valid Bearer token — an attempt is scoped to its own owner
 * (`MockTestAttemptsService`, 404 on mismatch), the same shape
 * `AssessmentController`'s own attempt endpoints already established.
 */
@ApiTags('exams')
@Controller('mock-test-attempts')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class MockTestAttemptsController {
  constructor(private readonly mockTestAttemptsService: MockTestAttemptsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Start a new fixed-form mock-test attempt, returning every section's public-view content immediately",
  })
  async start(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(startMockTestAttemptRequestSchema))
    dto: StartMockTestAttemptRequest,
  ): Promise<StartMockTestAttemptResponse> {
    return this.mockTestAttemptsService.start(req.user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: "Read an attempt's own current state" })
  async get(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<MockTestAttemptResponse> {
    return this.mockTestAttemptsService.get(req.user, id);
  }

  @Post(':id/sections/:skill/responses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit a section response — objective score (Reading/Listening) or AI band score (Writing/Speaking)',
  })
  async submitSectionResponse(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Param('skill') skill: string,
    @Body(new ZodValidationPipe(submitSectionResponseRequestSchema))
    dto: SubmitSectionResponseRequest,
  ): Promise<MockTestSectionScoreResponse> {
    return this.mockTestAttemptsService.submitSectionResponse(req.user, id, skill, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Complete an attempt once every section has been scored (idempotent on repeat calls) — real overall band aggregation, exam.mock_test.completed emission',
  })
  async complete(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<MockTestAttemptResponse> {
    return this.mockTestAttemptsService.complete(req.user, id);
  }
}
