import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  addToDeckRequestSchema,
  dueDeckListQuerySchema,
  submitDeckReviewRequestSchema,
  type AddToDeckRequest,
  type DueDeckListQuery,
  type DueDeckListResponse,
  type SubmitDeckReviewRequest,
  type UserVocabularyEntryResponse,
} from '@linguaai/validation/vocabulary';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { SrsDeckService } from './srs-deck.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/vocabulary/deck*` (E9 T3, §6.3, ADR-042). Any authenticated user —
 * every deck entry is scoped to the caller's own `userId`, never
 * client-supplied.
 */
@ApiTags('vocabulary')
@Controller('vocabulary/deck')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class SrsDeckController {
  constructor(private readonly srsDeck: SrsDeckService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Add a curated VocabularyItem to the caller's own SRS deck (idempotent)",
  })
  async addToDeck(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(addToDeckRequestSchema)) dto: AddToDeckRequest,
  ): Promise<UserVocabularyEntryResponse> {
    return this.srsDeck.addToDeck(req.user, dto);
  }

  @Get('due')
  @ApiOperation({ summary: "The caller's own cards due for review today, cursor-paginated" })
  async listDue(
    @Req() req: JwtAuthenticatedRequest,
    @Query(new ZodValidationPipe(dueDeckListQuerySchema)) query: DueDeckListQuery,
  ): Promise<DueDeckListResponse> {
    return this.srsDeck.listDue(req.user, query);
  }

  @Post(':id/reviews')
  @ApiOperation({
    summary:
      "Submit a review (quality 0-5, the standard SM-2 input scale) for one of the caller's own deck entries",
  })
  async submitReview(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitDeckReviewRequestSchema)) dto: SubmitDeckReviewRequest,
  ): Promise<UserVocabularyEntryResponse> {
    return this.srsDeck.submitReview(req.user, id, dto.quality);
  }
}
