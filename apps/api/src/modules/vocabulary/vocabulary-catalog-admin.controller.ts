import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createVocabularyItemRequestSchema,
  updateVocabularyItemRequestSchema,
  type CreateVocabularyItemRequest,
  type UpdateVocabularyItemRequest,
  type VocabularyItemResponse,
} from '@linguaai/validation/vocabulary';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

/**
 * `/v1/admin/vocabulary-items*` (E9 T1, §6.1). `ADMIN`-only (`@Roles('ADMIN')`
 * + `MfaGuard`, matching `AuditController`/`CourseHierarchyController`'s own
 * precedent for platform-wide `ADMIN`-only authoring routes) — `TEACHER` has
 * no self-serve vocabulary-catalog authoring at MVP (PRD.md §5.1, design
 * doc §3.6).
 */
@ApiTags('admin-vocabulary')
@Controller('admin/vocabulary-items')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class VocabularyCatalogAdminController {
  constructor(private readonly vocabularyCatalog: VocabularyCatalogService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Author a new curated VocabularyItem' })
  async create(
    @Body(new ZodValidationPipe(createVocabularyItemRequestSchema))
    dto: CreateVocabularyItemRequest,
  ): Promise<VocabularyItemResponse> {
    return this.vocabularyCatalog.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a VocabularyItem' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVocabularyItemRequestSchema))
    dto: UpdateVocabularyItemRequest,
  ): Promise<VocabularyItemResponse> {
    return this.vocabularyCatalog.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a VocabularyItem' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.vocabularyCatalog.delete(id);
  }
}
