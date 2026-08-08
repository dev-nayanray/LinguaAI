import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  draftLessonRequestSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';
import {
  draftVocabularyItemRequestSchema,
  type DraftVocabularyItemRequest,
  type VocabularyItemDraft,
} from '@linguaai/validation/vocabulary';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ContentDraftingService } from './content-drafting.service.js';

/**
 * ADR-033's pattern applied to content drafting (E8 T4; E9 T4 extends this
 * same controller with `draft-vocabulary-item`). Same trust model as
 * `AssessmentScoringController`: no auth guard here — internal-
 * network-only, `apps/api`'s own already-authenticated (and `ADMIN`-role-
 * checked) request is the trust boundary. `apps/api`'s `CourseModule`/
 * `VocabularyModule` call this via their own `AiEngineClientService`.
 */
@ApiTags('content-authoring')
@Controller('content-authoring')
export class ContentDraftingController {
  constructor(private readonly contentDrafting: ContentDraftingService) {}

  @Post('draft-lesson')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Draft a first-draft lesson (title, one activity, 3-5 exercises) for admin review — never auto-published',
  })
  async draftLesson(
    @Body(new ZodValidationPipe(draftLessonRequestSchema)) dto: DraftLessonRequest,
  ): Promise<ContentDraftLesson> {
    return this.contentDrafting.draftLesson(dto);
  }

  @Post('draft-vocabulary-item')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Draft a first-draft curated VocabularyItem (part of speech, translations, example sentences) for admin review — never auto-published',
  })
  async draftVocabularyItem(
    @Body(new ZodValidationPipe(draftVocabularyItemRequestSchema)) dto: DraftVocabularyItemRequest,
  ): Promise<VocabularyItemDraft> {
    return this.contentDrafting.draftVocabularyItem(dto);
  }
}
