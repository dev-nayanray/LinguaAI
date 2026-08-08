import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  draftVocabularyItemRequestSchema,
  type DraftVocabularyItemRequest,
  type VocabularyItemDraft,
} from '@linguaai/validation/vocabulary';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

/**
 * `/v1/admin/vocabulary-items/ai-draft` (E9 T4, §6.4). `ADMIN`-only,
 * matching `VocabularyCatalogAdminController`'s own precedent exactly.
 * Calls `AiEngineClientService.draftVocabularyItem()` and returns the
 * proposal as-is — this endpoint never creates, updates, or publishes
 * anything itself; an `ADMIN` reviews the returned draft and submits it
 * (edited as needed) through the real `POST /v1/admin/vocabulary-items`
 * endpoint `VocabularyCatalogAdminController` already defines (§6.1) — no
 * separate "AI-authored" bypass path exists, the same discipline E8 T4's
 * `ContentAuthoringController` already established.
 */
@ApiTags('admin-vocabulary')
@Controller('admin/vocabulary-items')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class VocabularyAuthoringController {
  constructor(private readonly aiEngineClient: AiEngineClientService) {}

  @Post('ai-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI-assisted first-draft VocabularyItem generation (part of speech, translations, example sentences) for admin review — never auto-published',
  })
  async draftVocabularyItem(
    @Body(new ZodValidationPipe(draftVocabularyItemRequestSchema)) dto: DraftVocabularyItemRequest,
  ): Promise<VocabularyItemDraft> {
    return this.aiEngineClient.draftVocabularyItem(dto);
  }
}
