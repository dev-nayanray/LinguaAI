import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  draftLessonRequestSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ContentDraftingService } from './content-drafting.service.js';

/**
 * ADR-033's pattern applied to content drafting (E8 T4). Same trust model
 * as `AssessmentScoringController`: no auth guard here — internal-
 * network-only, `apps/api`'s own already-authenticated (and `ADMIN`-role-
 * checked) request is the trust boundary. `apps/api`'s `CourseModule`
 * calls this via its own `AiEngineClientService.draftLesson()`.
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
}
