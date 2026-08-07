import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  draftLessonRequestSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

/**
 * `/v1/admin/lessons/ai-draft` (E8 T4, §6.4). `ADMIN`-only, matching
 * `CourseHierarchyController`'s own precedent exactly. Calls
 * `AiEngineClientService.draftLesson()` and returns the proposal as-is —
 * this endpoint never creates, updates, or publishes anything itself; an
 * `ADMIN` reviews the returned draft and submits it (edited as needed)
 * through the real `POST .../lessons`/`.../activities`/`.../exercises`
 * endpoints `CourseHierarchyController`/`LessonContentController` already
 * define (§6.1) — no separate "AI-authored" bypass path exists.
 */
@ApiTags('admin-courses')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class ContentAuthoringController {
  constructor(private readonly aiEngineClient: AiEngineClientService) {}

  @Post('lessons/ai-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI-assisted first-draft lesson generation (title, one activity, 3-5 exercises) for admin review — never auto-published',
  })
  async draftLesson(
    @Body(new ZodValidationPipe(draftLessonRequestSchema)) dto: DraftLessonRequest,
  ): Promise<ContentDraftLesson> {
    return this.aiEngineClient.draftLesson(dto);
  }
}
