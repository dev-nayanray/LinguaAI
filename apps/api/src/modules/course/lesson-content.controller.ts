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
  createActivityRequestSchema,
  createExerciseRequestSchema,
  createLessonRequestSchema,
  createQuizRequestSchema,
  updateActivityRequestSchema,
  updateExerciseRequestSchema,
  updateLessonRequestSchema,
  updateQuizRequestSchema,
  type ActivityResponse,
  type CreateActivityRequest,
  type CreateExerciseRequest,
  type CreateLessonRequest,
  type CreateQuizRequest,
  type ExerciseResponse,
  type LessonResponse,
  type QuizResponse,
  type UpdateActivityRequest,
  type UpdateExerciseRequest,
  type UpdateLessonRequest,
  type UpdateQuizRequest,
} from '@linguaai/validation/content';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { LessonContentService } from './lesson-content.service.js';

/**
 * `/v1/admin/units/:unitId/lessons*`, `/v1/admin/lessons*`,
 * `/v1/admin/activities*`, `/v1/admin/quizzes*` (E8 T1, §6.1). `ADMIN`-only,
 * matching `CourseHierarchyController`'s own precedent exactly.
 */
@ApiTags('admin-courses')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class LessonContentController {
  constructor(private readonly lessonContent: LessonContentService) {}

  @Post('units/:unitId/lessons')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Lesson within a Unit' })
  async createLesson(
    @Param('unitId') unitId: string,
    @Body(new ZodValidationPipe(createLessonRequestSchema)) dto: CreateLessonRequest,
  ): Promise<LessonResponse> {
    return this.lessonContent.createLesson(unitId, dto);
  }

  @Patch('lessons/:id')
  @ApiOperation({
    summary: 'Update a Lesson (snapshots a new ContentVersion if its Course is already published)',
  })
  async updateLesson(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLessonRequestSchema)) dto: UpdateLessonRequest,
  ): Promise<LessonResponse> {
    return this.lessonContent.updateLesson(id, dto);
  }

  @Delete('lessons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a Lesson' })
  async deleteLesson(@Param('id') id: string): Promise<void> {
    await this.lessonContent.deleteLesson(id);
  }

  @Post('lessons/:lessonId/activities')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an Activity within a Lesson' })
  async createActivity(
    @Param('lessonId') lessonId: string,
    @Body(new ZodValidationPipe(createActivityRequestSchema)) dto: CreateActivityRequest,
  ): Promise<ActivityResponse> {
    return this.lessonContent.createActivity(lessonId, dto);
  }

  @Patch('activities/:id')
  @ApiOperation({
    summary:
      'Update an Activity (snapshots a new ContentVersion if its Course is already published)',
  })
  async updateActivity(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateActivityRequestSchema)) dto: UpdateActivityRequest,
  ): Promise<ActivityResponse> {
    return this.lessonContent.updateActivity(id, dto);
  }

  @Delete('activities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an Activity' })
  async deleteActivity(@Param('id') id: string): Promise<void> {
    await this.lessonContent.deleteActivity(id);
  }

  @Post('activities/:activityId/quizzes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Quiz within an Activity' })
  async createQuiz(
    @Param('activityId') activityId: string,
    @Body(new ZodValidationPipe(createQuizRequestSchema)) dto: CreateQuizRequest,
  ): Promise<QuizResponse> {
    return this.lessonContent.createQuiz(activityId, dto);
  }

  @Patch('quizzes/:id')
  @ApiOperation({
    summary: 'Update a Quiz (snapshots a new ContentVersion if its Course is already published)',
  })
  async updateQuiz(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuizRequestSchema)) dto: UpdateQuizRequest,
  ): Promise<QuizResponse> {
    return this.lessonContent.updateQuiz(id, dto);
  }

  @Delete('quizzes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a Quiz' })
  async deleteQuiz(@Param('id') id: string): Promise<void> {
    await this.lessonContent.deleteQuiz(id);
  }

  @Post('activities/:activityId/exercises')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an Exercise within an Activity (optionally grouped into a Quiz)',
  })
  async createExercise(
    @Param('activityId') activityId: string,
    @Body(new ZodValidationPipe(createExerciseRequestSchema)) dto: CreateExerciseRequest,
  ): Promise<ExerciseResponse> {
    return this.lessonContent.createExercise(activityId, dto);
  }

  @Patch('exercises/:id')
  @ApiOperation({
    summary:
      'Update an Exercise (snapshots a new ContentVersion if its Course is already published)',
  })
  async updateExercise(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExerciseRequestSchema)) dto: UpdateExerciseRequest,
  ): Promise<ExerciseResponse> {
    return this.lessonContent.updateExercise(id, dto);
  }

  @Delete('exercises/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an Exercise' })
  async deleteExercise(@Param('id') id: string): Promise<void> {
    await this.lessonContent.deleteExercise(id);
  }
}
