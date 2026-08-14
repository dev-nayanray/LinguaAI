import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ExamProgramListResponse } from '@linguaai/validation/exams';

import { ExamCatalogService } from './exam-catalog.service.js';

/** `GET /v1/exam-programs` (E19 T1, design doc §5) — any authenticated learner. */
@ApiTags('exams')
@Controller('exam-programs')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ExamCatalogController {
  constructor(private readonly examCatalogService: ExamCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List active exam programs' })
  async list(): Promise<ExamProgramListResponse> {
    return this.examCatalogService.listActive();
  }
}
