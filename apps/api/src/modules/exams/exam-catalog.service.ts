import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type { ExamProgramListResponse } from '@linguaai/validation/exams';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

/**
 * `GET /v1/exam-programs` (E19 T1, design doc §5) — learner-facing
 * discovery, active programs only. `rubric` is never served here (scoring
 * metadata, not something a learner needs to see) — `examProgramListResponseSchema`'s
 * own shape already omits it, the same discipline `ExamProgramService.list()`
 * (the admin equivalent) already applies for its own list view.
 */
@Injectable()
export class ExamCatalogService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async listActive(): Promise<ExamProgramListResponse> {
    const examPrograms = await this.appPrisma.examProgram.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      data: examPrograms.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        description: row.description,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
