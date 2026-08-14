import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMockTestSectionRequestSchema,
  updateMockTestSectionRequestSchema,
  type CreateMockTestSectionRequest,
  type MockTestSectionResponse,
  type UpdateMockTestSectionRequest,
} from '@linguaai/validation/exams';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MfaGuard } from '../auth/guards/mfa.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { MockTestSectionService } from './mock-test-section.service.js';

/**
 * `/v1/admin/exam-programs/:examProgramId/sections*` (E19 T1, design doc
 * §5/§3.6) — `ADMIN`-only, nested `MockTestSection` authoring under its
 * own owning `ExamProgram`.
 */
@ApiTags('admin-exams')
@Controller('admin/exam-programs/:examProgramId/sections')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class MockTestSectionAdminController {
  constructor(private readonly mockTestSectionService: MockTestSectionService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a MockTestSection for a skill (one per skill per program) — LISTENING content is server-side synthesized into real audio',
  })
  async create(
    @Param('examProgramId') examProgramId: string,
    @Body(new ZodValidationPipe(createMockTestSectionRequestSchema))
    dto: CreateMockTestSectionRequest,
  ): Promise<MockTestSectionResponse> {
    return this.mockTestSectionService.create(examProgramId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List every MockTestSection for a program, ordered' })
  async list(@Param('examProgramId') examProgramId: string): Promise<MockTestSectionResponse[]> {
    return this.mockTestSectionService.list(examProgramId);
  }

  @Get(':skill')
  @ApiOperation({ summary: 'Read a single MockTestSection, admin view (correctIndex included)' })
  async get(
    @Param('examProgramId') examProgramId: string,
    @Param('skill') skill: string,
  ): Promise<MockTestSectionResponse> {
    return this.mockTestSectionService.get(examProgramId, skill);
  }

  @Patch(':skill')
  @ApiOperation({ summary: 'Update a MockTestSection' })
  async update(
    @Param('examProgramId') examProgramId: string,
    @Param('skill') skill: string,
    @Body(new ZodValidationPipe(updateMockTestSectionRequestSchema))
    dto: UpdateMockTestSectionRequest,
  ): Promise<MockTestSectionResponse> {
    return this.mockTestSectionService.update(examProgramId, skill, dto);
  }
}
