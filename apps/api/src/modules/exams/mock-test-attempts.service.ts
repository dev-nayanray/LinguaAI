import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient, Skill } from '@linguaai/database';
import {
  examMockTestCompletedPayloadSchema,
  type MockTestAttemptResponse,
  type MockTestSectionPublicView,
  type MockTestSectionScoreResponse,
  type StartMockTestAttemptRequest,
  type StartMockTestAttemptResponse,
  type SubmitSectionResponseRequest,
} from '@linguaai/validation/exams';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import { examBandFromCorrectCount } from './exam-band-conversion.util.js';

const OBJECTIVE_SKILLS_WITH_QUESTIONS: readonly Skill[] = ['READING', 'LISTENING'];
const AI_SCORED_SKILLS: readonly Skill[] = ['WRITING', 'SPEAKING'];

/** IELTS's own real overall-score convention: mean of the 4 section bands, rounded to the nearest 0.5 (design doc §3.5) — 0.25 rounds up, matching `Math.round`'s own "round half towards +Infinity" behavior for positive numbers. */
function roundToNearestHalfBand(value: number): number {
  return Math.round(value * 2) / 2;
}

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
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly aiEngineClient: AiEngineClientService,
    private readonly events: DomainEventPublisher,
  ) {}

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
    const attempt = await this.getOwnedAttempt(caller, id);
    return toWireAttempt(attempt);
  }

  /**
   * `POST .../sections/:skill/responses` (E19 T2, design doc §5/§6.2/§6.3).
   * Reading/Listening are scored objectively, in-process, against the
   * section's own real `correctIndex` answer key (never leaked to the
   * learner, §3.4) — no AI call needed for a question type with one real
   * correct answer. Writing/Speaking are scored by `ai-engine`'s
   * RAG-grounded `ExamScoringService` (ADR-058); for `SPEAKING`, `text` is
   * a written transcript of the learner's own spoken response (design
   * doc §10 — this epic does not integrate a real live speech-capture
   * session into the mock-test flow).
   */
  async submitSectionResponse(
    caller: RequestUser,
    attemptId: string,
    skill: string,
    dto: SubmitSectionResponseRequest,
  ): Promise<MockTestSectionScoreResponse> {
    const attempt = await this.getOwnedAttempt(caller, attemptId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException(`Attempt is already ${attempt.status.toLowerCase()}`);
    }

    const section = await this.appPrisma.mockTestSection.findUnique({
      where: {
        examProgramId_skill: { examProgramId: attempt.examProgramId, skill: skill as Skill },
      },
    });
    if (!section) {
      throw new NotFoundException('Mock test section not found for this exam program');
    }

    const existingScore = await this.appPrisma.mockTestSectionScore.findUnique({
      where: { mockTestAttemptId_skill: { mockTestAttemptId: attempt.id, skill: skill as Skill } },
    });
    if (existingScore) {
      throw new ConflictException(
        `This section (${skill}) has already been scored for this attempt`,
      );
    }

    const { score, feedback } = await this.scoreSection(section, dto);

    const sectionScore = await this.appPrisma.mockTestSectionScore.create({
      data: { mockTestAttemptId: attempt.id, skill: skill as Skill, score, feedback },
    });

    return {
      skill: sectionScore.skill,
      score: sectionScore.score,
      feedback: sectionScore.feedback,
    };
  }

  private async scoreSection(
    section: { skill: Skill; content: unknown },
    dto: SubmitSectionResponseRequest,
  ): Promise<{ score: number; feedback: string | null }> {
    const content = section.content as Record<string, unknown>;

    if (OBJECTIVE_SKILLS_WITH_QUESTIONS.includes(section.skill)) {
      if (!('answers' in dto)) {
        throw new ConflictException(
          `${section.skill} sections require an "answers" array, not "text"`,
        );
      }
      const questions = content.questions as { correctIndex: number }[];
      const correctCount = dto.answers.filter(
        (a) => questions[a.questionIndex]?.correctIndex === a.selectedIndex,
      ).length;
      return { score: examBandFromCorrectCount(correctCount, questions.length), feedback: null };
    }

    if (AI_SCORED_SKILLS.includes(section.skill)) {
      if (!('text' in dto)) {
        throw new ConflictException(
          `${section.skill} sections require "text", not an "answers" array`,
        );
      }
      const taskPrompt =
        section.skill === 'WRITING'
          ? (content.taskPrompt as string)
          : (content.prompts as string[]).join(' ');
      const result = await this.aiEngineClient.scoreExamSection({
        skill: section.skill as 'WRITING' | 'SPEAKING',
        taskPrompt,
        learnerResponse: dto.text,
      });
      return { score: result.band, feedback: result.feedback };
    }

    throw new ConflictException(`No scoring strategy defined for skill "${section.skill}"`);
  }

  /**
   * `POST .../complete` (E19 T2, design doc §5/§3.5/§6.4) — idempotent on
   * repeat calls, the same "complete" contract `AssessmentService.completeAttempt`
   * already established. Real overall band aggregation: mean of every
   * scored section's own band, rounded to the nearest 0.5.
   */
  async complete(caller: RequestUser, attemptId: string): Promise<MockTestAttemptResponse> {
    const attempt = await this.getOwnedAttempt(caller, attemptId);
    if (attempt.status === 'COMPLETED') {
      return toWireAttempt(attempt);
    }

    const [sections, scores] = await Promise.all([
      this.appPrisma.mockTestSection.findMany({ where: { examProgramId: attempt.examProgramId } }),
      this.appPrisma.mockTestSectionScore.findMany({ where: { mockTestAttemptId: attempt.id } }),
    ]);
    if (scores.length < sections.length) {
      throw new ConflictException(
        `Attempt is not ready to complete — ${sections.length - scores.length} section(s) still need scoring`,
      );
    }

    const overallScore = roundToNearestHalfBand(
      scores.reduce((sum, s) => sum + s.score, 0) / scores.length,
    );

    const updated = await this.appPrisma.mockTestAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED', completedAt: new Date(), overallScore },
    });

    const eventPayload = examMockTestCompletedPayloadSchema.parse({
      mockTestAttemptId: updated.id,
      examProgramId: updated.examProgramId,
      overallScore,
    });
    await this.events.publish('exam.mock_test.completed', {
      userId: caller.userId,
      payload: eventPayload,
    });

    return toWireAttempt(updated);
  }

  private async getOwnedAttempt(caller: RequestUser, id: string) {
    const attempt = await this.appPrisma.mockTestAttempt.findUnique({ where: { id } });
    if (!attempt || attempt.userId !== caller.userId) {
      throw new NotFoundException('Mock test attempt not found');
    }
    return attempt;
  }
}
