import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  vocabularyItemListQuerySchema,
  type VocabularyItemListQuery,
  type VocabularyItemListResponse,
  type VocabularyItemResponse,
} from '@linguaai/validation/vocabulary';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

/**
 * `/v1/vocabulary-items*` (E9 T1, §6.1) — any authenticated user, matching
 * `CourseCatalogController`'s own published-content precedent. No
 * draft/published distinction exists at the `VocabularyItem` level (design
 * doc §6.1, §8) — every non-deleted item is catalog-visible.
 */
@ApiTags('vocabulary')
@Controller('vocabulary-items')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class VocabularyCatalogController {
  constructor(private readonly vocabularyCatalog: VocabularyCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'List the curated vocabulary catalog, filterable by language and search term',
  })
  async list(
    @Query(new ZodValidationPipe(vocabularyItemListQuerySchema)) query: VocabularyItemListQuery,
  ): Promise<VocabularyItemListResponse> {
    return this.vocabularyCatalog.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single VocabularyItem' })
  async getById(@Param('id') id: string): Promise<VocabularyItemResponse> {
    return this.vocabularyCatalog.getById(id);
  }
}
