import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@linguaai/database';
import type {
  CreateExamProgramRequest,
  ExamProgramListResponse,
  ExamProgramResponse,
  UpdateExamProgramRequest,
} from '@linguaai/validation/exams';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

function toWireExamProgram(row: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  rubric: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ExamProgramResponse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    rubric: row.rubric as Record<string, unknown>,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `ExamProgram` admin authoring (E19 T1, design doc §3.6/§5) — `ADMIN`-gated,
 * mirroring `CourseHierarchyService`'s own established pattern exactly.
 */
@Injectable()
export class ExamProgramService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async create(dto: CreateExamProgramRequest): Promise<ExamProgramResponse> {
    const examProgram = await this.appPrisma.examProgram.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        rubric: dto.rubric as Prisma.InputJsonValue,
      },
    });
    return toWireExamProgram(examProgram);
  }

  async update(id: string, dto: UpdateExamProgramRequest): Promise<ExamProgramResponse> {
    await this.getOwned(id);
    const examProgram = await this.appPrisma.examProgram.update({
      where: { id },
      data: { ...dto, rubric: dto.rubric as Prisma.InputJsonValue | undefined },
    });
    return toWireExamProgram(examProgram);
  }

  async get(id: string): Promise<ExamProgramResponse> {
    const examProgram = await this.getOwned(id);
    return toWireExamProgram(examProgram);
  }

  /**
   * `ADMIN` listing — every program, active or not (unlike the
   * learner-facing catalog, `ExamCatalogService.listActive()`).
   * `rubric` is omitted from the list view, matching
   * `examProgramListResponseSchema`'s own shape — the full rubric is only
   * ever served via `get()`, the same "list is a summary, detail is the
   * full row" precedent every other admin list endpoint in this codebase
   * already follows.
   */
  async list(): Promise<ExamProgramListResponse> {
    const examPrograms = await this.appPrisma.examProgram.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return {
      data: examPrograms.map((row) => {
        const { rubric: _rubric, ...rest } = toWireExamProgram(row);
        return rest;
      }),
    };
  }

  private async getOwned(id: string) {
    const examProgram = await this.appPrisma.examProgram.findUnique({ where: { id } });
    if (!examProgram) {
      throw new NotFoundException('Exam program not found');
    }
    return examProgram;
  }
}
