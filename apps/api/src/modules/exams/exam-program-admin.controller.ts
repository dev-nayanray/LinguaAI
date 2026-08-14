import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createExamProgramRequestSchema,
  updateExamProgramRequestSchema,
  type CreateExamProgramRequest,
  type ExamProgramListResponse,
  type ExamProgramResponse,
  type UpdateExamProgramRequest,
} from '@linguaai/validation/exams';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ExamProgramService } from './exam-program.service.js';

/**
 * `/v1/admin/exam-programs*` (E19 T1, design doc §5/§3.6). `ADMIN`-only,
 * mirroring `CourseHierarchyController`'s own established pattern exactly
 * (`AuthGuard('jwt')` + `RolesGuard` + `MfaGuard` + `@Roles('ADMIN')`).
 */
@ApiTags('admin-exams')
@Controller('admin/exam-programs')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class ExamProgramAdminController {
  constructor(private readonly examProgramService: ExamProgramService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ExamProgram' })
  async create(
    @Body(new ZodValidationPipe(createExamProgramRequestSchema)) dto: CreateExamProgramRequest,
  ): Promise<ExamProgramResponse> {
    return this.examProgramService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List every ExamProgram (active or not)' })
  async list(): Promise<ExamProgramListResponse> {
    return this.examProgramService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a single ExamProgram, rubric included' })
  async get(@Param('id') id: string): Promise<ExamProgramResponse> {
    return this.examProgramService.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an ExamProgram' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExamProgramRequestSchema)) dto: UpdateExamProgramRequest,
  ): Promise<ExamProgramResponse> {
    return this.examProgramService.update(id, dto);
  }
}
