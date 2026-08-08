import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  courseListQuerySchema,
  type CourseDetailResponse,
  type CourseListQuery,
  type CourseListResponse,
  type LessonDetailResponse,
} from '@linguaai/validation/content';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CourseCatalogService } from './course-catalog.service.js';

/** `/v1/courses*`, `/v1/lessons/:id` (E8 T2, §6.2). Any authenticated user — a real course catalog, not per-user private data, matching `CourseCatalogService`'s own doc comment. */
@ApiTags('courses')
@Controller()
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class CourseCatalogController {
  constructor(private readonly courseCatalog: CourseCatalogService) {}

  @Get('courses')
  @ApiOperation({
    summary: 'Browse the published course catalog (optionally filtered by ?languageId)',
  })
  async listCourses(
    @Query(new ZodValidationPipe(courseListQuerySchema)) query: CourseListQuery,
  ): Promise<CourseListResponse> {
    return this.courseCatalog.listCourses(query);
  }

  @Get('courses/:id')
  @ApiOperation({
    summary:
      "A published course's outline (Levels -> Units -> Lessons, shallow); 404 for a draft or missing course",
  })
  async getCourseDetail(@Param('id') id: string): Promise<CourseDetailResponse> {
    return this.courseCatalog.getCourseDetail(id);
  }

  @Get('lessons/:id')
  @ApiOperation({
    summary:
      "A lesson's full servable content (Activities -> Exercises/Quizzes, no answer keys); 404 if its course isn't published",
  })
  async getLessonDetail(@Param('id') id: string): Promise<LessonDetailResponse> {
    return this.courseCatalog.getLessonDetail(id);
  }
}
