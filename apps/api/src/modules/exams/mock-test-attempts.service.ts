import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient, Skill } from '@linguaai/database';
import type {
  MockTestAttemptResponse,
  MockTestSectionPublicView,
  StartMockTestAttemptRequest,
  StartMockTestAttemptResponse,
} from '@linguaai/validation/exams';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';

const OBJECTIVE_SKILLS_WITH_QUESTIONS: readonly Skill[] = ['READING', 'LISTENING'];

/**
 * Strips `correctIndex` from every question before a section ever reaches
 * a learner (design doc §3.4/§6.1) — the real mechanism, since
 * `mockTestSectionPublicViewSchema` itself only *validates* shape, it
 * never transforms `content` (packages/validation/src/exams/index.test.ts's
 * own documented finding). Every other skill's content has no answer key
 * to strip at all (`WRITING`/`SPEAKING` content is served as-is).
 */
function toPublicSectionView(section: {
  id: string;
  examProgramId: string;
  skill: Skill;
  order: number;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MockTestSectionPublicView {
  const content = section.content as Record<string, unknown>;
  const publicContent = OBJECTIVE_SKILLS_WITH_QUESTIONS.includes(section.skill)
    ? {
        ...content,
        questions: (content.questions as Record<string, unknown>[]).map(
          ({ correctIndex: _correctIndex, ...rest }) => rest,
        ),
      }
    : content;
  return {
    id: section.id,
    examProgramId: section.examProgramId,
    skill: section.skill,
    order: section.order,
    content: publicContent,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

function toWireAttempt(attempt: {
  id: string;
  userId: string;
  examProgramId: string;
  status: string;
  overallScore: number | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MockTestAttemptResponse {
  return {
    id: attempt.id,
    userId: attempt.userId,
    examProgramId: attempt.examProgramId,
    status: attempt.status as MockTestAttemptResponse['status'],
    overallScore: attempt.overallScore,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

/**
 * Fixed-form mock-test-attempt lifecycle (E19 T1, design doc §3.4) — unlike
 * `AssessmentController`'s own adaptive, item-by-item serve loop (E6 T2),
 * a real IELTS exam is fixed-form: every section is served immediately at
 * attempt start, in full.
 */
@Injectable()
export class MockTestAttemptsService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async start(
    caller: RequestUser,
    dto: StartMockTestAttemptRequest,
  ): Promise<StartMockTestAttemptResponse> {
    const examProgram = await this.appPrisma.examProgram.findUnique({
      where: { id: dto.examProgramId },
    });
    if (!examProgram || !examProgram.isActive) {
      throw new NotFoundException('Exam program not found');
    }

    const [attempt, sections] = await Promise.all([
      this.appPrisma.mockTestAttempt.create({
        data: { userId: caller.userId, examProgramId: dto.examProgramId },
      }),
      this.appPrisma.mockTestSection.findMany({
        where: { examProgramId: dto.examProgramId },
        orderBy: { order: 'asc' },
      }),
    ]);

    return {
      ...toWireAttempt(attempt),
      sections: sections.map(toPublicSectionView),
    };
  }

  async get(caller: RequestUser, id: string): Promise<MockTestAttemptResponse> {
    const attempt = await this.appPrisma.mockTestAttempt.findUnique({ where: { id } });
    if (!attempt || attempt.userId !== caller.userId) {
      throw new NotFoundException('Mock test attempt not found');
    }
    return toWireAttempt(attempt);
  }
}
