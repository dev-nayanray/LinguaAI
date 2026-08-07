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
  createCourseRequestSchema,
  createLevelRequestSchema,
  createUnitRequestSchema,
  updateCourseRequestSchema,
  updateLevelRequestSchema,
  updateUnitRequestSchema,
  type CourseResponse,
  type CreateCourseRequest,
  type CreateLevelRequest,
  type CreateUnitRequest,
  type LevelResponse,
  type UnitResponse,
  type UpdateCourseRequest,
  type UpdateLevelRequest,
  type UpdateUnitRequest,
} from '@linguaai/validation/content';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CourseHierarchyService } from './course-hierarchy.service.js';

/**
 * `/v1/admin/courses*`, `/v1/admin/levels*`, `/v1/admin/units*` (E8 T1,
 * §6.1). `ADMIN`-only (`@Roles('ADMIN')` + `MfaGuard`, matching
 * `AuditController`'s own precedent for platform-wide `ADMIN`-only
 * routes) — `TEACHER` has no self-serve course-authoring capability at
 * MVP (PRD.md §5.1, design doc §3.5).
 */
@ApiTags('admin-courses')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class CourseHierarchyController {
  constructor(private readonly courseHierarchy: CourseHierarchyService) {}

  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new draft Course' })
  async createCourse(
    @Body(new ZodValidationPipe(createCourseRequestSchema)) dto: CreateCourseRequest,
  ): Promise<CourseResponse> {
    return this.courseHierarchy.createCourse(dto);
  }

  @Patch('courses/:id')
  @ApiOperation({ summary: 'Update a Course' })
  async updateCourse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCourseRequestSchema)) dto: UpdateCourseRequest,
  ): Promise<CourseResponse> {
    return this.courseHierarchy.updateCourse(id, dto);
  }

  @Post('courses/:id/publish')
  @ApiOperation({
    summary:
      'Publish a Course, backfilling a version-1 ContentVersion snapshot for every Lesson/Activity/Exercise/Quiz beneath it (idempotent)',
  })
  async publishCourse(@Param('id') id: string): Promise<CourseResponse> {
    return this.courseHierarchy.publishCourse(id);
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a Course' })
  async deleteCourse(@Param('id') id: string): Promise<void> {
    await this.courseHierarchy.deleteCourse(id);
  }

  @Post('courses/:courseId/levels')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Level within a Course' })
  async createLevel(
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(createLevelRequestSchema)) dto: CreateLevelRequest,
  ): Promise<LevelResponse> {
    return this.courseHierarchy.createLevel(courseId, dto);
  }

  @Patch('levels/:id')
  @ApiOperation({ summary: 'Update a Level' })
  async updateLevel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLevelRequestSchema)) dto: UpdateLevelRequest,
  ): Promise<LevelResponse> {
    return this.courseHierarchy.updateLevel(id, dto);
  }

  @Delete('levels/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a Level' })
  async deleteLevel(@Param('id') id: string): Promise<void> {
    await this.courseHierarchy.deleteLevel(id);
  }

  @Post('levels/:levelId/units')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Unit within a Level' })
  async createUnit(
    @Param('levelId') levelId: string,
    @Body(new ZodValidationPipe(createUnitRequestSchema)) dto: CreateUnitRequest,
  ): Promise<UnitResponse> {
    return this.courseHierarchy.createUnit(levelId, dto);
  }

  @Patch('units/:id')
  @ApiOperation({ summary: 'Update a Unit' })
  async updateUnit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUnitRequestSchema)) dto: UpdateUnitRequest,
  ): Promise<UnitResponse> {
    return this.courseHierarchy.updateUnit(id, dto);
  }

  @Delete('units/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a Unit' })
  async deleteUnit(@Param('id') id: string): Promise<void> {
    await this.courseHierarchy.deleteUnit(id);
  }
}
