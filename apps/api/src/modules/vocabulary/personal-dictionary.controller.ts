import {
  Body,
  Controller,
  Delete,
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
  createPersonalDictionaryEntryRequestSchema,
  personalDictionaryListQuerySchema,
  type CreatePersonalDictionaryEntryRequest,
  type PersonalDictionaryEntryResponse,
  type PersonalDictionaryListQuery,
  type PersonalDictionaryListResponse,
} from '@linguaai/validation/vocabulary';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PersonalDictionaryService } from './personal-dictionary.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/vocabulary/personal-dictionary*` (E9 T2, §6.2). Any authenticated
 * user — every entry is scoped to the caller's own `userId`, never
 * client-supplied.
 */
@ApiTags('vocabulary')
@Controller('vocabulary/personal-dictionary')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class PersonalDictionaryController {
  constructor(private readonly personalDictionary: PersonalDictionaryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Save a term to the personal dictionary from any source, optionally linked to a curated VocabularyItem',
  })
  async create(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(createPersonalDictionaryEntryRequestSchema))
    dto: CreatePersonalDictionaryEntryRequest,
  ): Promise<PersonalDictionaryEntryResponse> {
    return this.personalDictionary.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's own saved terms, cursor-paginated" })
  async list(
    @Req() req: JwtAuthenticatedRequest,
    @Query(new ZodValidationPipe(personalDictionaryListQuerySchema))
    query: PersonalDictionaryListQuery,
  ): Promise<PersonalDictionaryListResponse> {
    return this.personalDictionary.list(req.user, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a saved term from the caller's own personal dictionary" })
  async delete(@Req() req: JwtAuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.personalDictionary.delete(req.user, id);
  }
}
