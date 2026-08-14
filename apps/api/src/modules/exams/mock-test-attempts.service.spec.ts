import { ConflictException, NotFoundException } from '@nestjs/common';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { MockTestAttemptsService } from './mock-test-attempts.service.js';

const examProgramId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const sectionId = '66666666-6666-4666-8666-666666666666';
const now = new Date('2026-08-14T00:00:00.000Z');
const caller: RequestUser = { userId, role: 'LEARNER', organizationId: null, orgRole: null };

function baseAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: attemptId,
    userId,
    examProgramId,
    status: 'IN_PROGRESS',
    overallScore: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('MockTestAttemptsService', () => {
  const examProgramFindUnique = jest.fn();
  const attemptCreate = jest.fn();
  const attemptFindUnique = jest.fn();
  const attemptUpdate = jest.fn();
  const sectionFindMany = jest.fn();
  const sectionFindUnique = jest.fn();
  const scoreFindUnique = jest.fn();
  const scoreFindMany = jest.fn();
  const scoreCreate = jest.fn();
  const scoreExamSection = jest.fn();
  const attemptFindMany = jest.fn();
  const attemptCount = jest.fn();
  const issueCertificate = jest.fn();
  const publish = jest.fn();
  const prisma = {
    examProgram: { findUnique: examProgramFindUnique },
    mockTestAttempt: {
      create: attemptCreate,
      findUnique: attemptFindUnique,
      update: attemptUpdate,
      findMany: attemptFindMany,
      count: attemptCount,
    },
    mockTestSection: { findMany: sectionFindMany, findUnique: sectionFindUnique },
    mockTestSectionScore: {
      findUnique: scoreFindUnique,
      findMany: scoreFindMany,
      create: scoreCreate,
    },
  };
  const aiEngineClient = { scoreExamSection };
  const events = { publish };
  const certificateService = { issue: issueCertificate };

  function buildService(): MockTestAttemptsService {
    return new MockTestAttemptsService(
      prisma as never,
      aiEngineClient as never,
      events as never,
      certificateService as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts an attempt and strips correctIndex from every READING/LISTENING question, leaving WRITING/SPEAKING untouched', async () => {
    examProgramFindUnique.mockResolvedValue({ id: examProgramId, isActive: true });
    attemptCreate.mockResolvedValue(baseAttempt());
    sectionFindMany.mockResolvedValue([
      {
        id: 'sec-reading',
        examProgramId,
        skill: 'READING',
        order: 0,
        content: {
          passage: 'x',
          questions: [{ prompt: 'q', options: ['a', 'b'], correctIndex: 1 }],
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sec-writing',
        examProgramId,
        skill: 'WRITING',
        order: 1,
        content: { taskPrompt: 'Describe a chart.', minWords: 150 },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const service = buildService();

    const result = await service.start(caller, { examProgramId });

    const readingSection = result.sections.find((s) => s.skill === 'READING')!;
    expect(readingSection.content.questions).toEqual([{ prompt: 'q', options: ['a', 'b'] }]);
    const writingSection = result.sections.find((s) => s.skill === 'WRITING')!;
    expect(writingSection.content).toEqual({ taskPrompt: 'Describe a chart.', minWords: 150 });
  });

  it('throws NotFoundException starting an attempt against an inactive exam program', async () => {
    examProgramFindUnique.mockResolvedValue({ id: examProgramId, isActive: false });
    const service = buildService();

    await expect(service.start(caller, { examProgramId })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(attemptCreate).not.toHaveBeenCalled();
  });

  it('throws NotFoundException reading an attempt owned by a different user', async () => {
    attemptFindUnique.mockResolvedValue(baseAttempt({ userId: 'someone-else' }));
    const service = buildService();

    await expect(service.get(caller, attemptId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the caller's own attempt", async () => {
    attemptFindUnique.mockResolvedValue(baseAttempt());
    const service = buildService();

    const result = await service.get(caller, attemptId);

    expect(result.id).toBe(attemptId);
  });

  describe('submitSectionResponse', () => {
    it('objectively scores a READING section against the real correctIndex answer key, never calling ai-engine', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindUnique.mockResolvedValue({
        id: sectionId,
        skill: 'READING',
        content: {
          passage: 'x',
          questions: [
            { prompt: 'q1', options: ['a', 'b'], correctIndex: 0 },
            { prompt: 'q2', options: ['a', 'b'], correctIndex: 1 },
          ],
        },
      });
      scoreFindUnique.mockResolvedValue(null);
      scoreCreate.mockResolvedValue({ skill: 'READING', score: 9, feedback: null });
      const service = buildService();

      const result = await service.submitSectionResponse(caller, attemptId, 'READING', {
        answers: [
          { questionIndex: 0, selectedIndex: 0 },
          { questionIndex: 1, selectedIndex: 1 },
        ],
      });

      expect(scoreExamSection).not.toHaveBeenCalled();
      expect(scoreCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ score: 9, feedback: null }) }),
      );
      expect(result.score).toBe(9);
    });

    it('scores a WRITING section via ai-engine RAG-grounded scoring, persisting real feedback', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindUnique.mockResolvedValue({
        id: sectionId,
        skill: 'WRITING',
        content: { taskPrompt: 'Describe a chart.', minWords: 150 },
      });
      scoreFindUnique.mockResolvedValue(null);
      scoreExamSection.mockResolvedValue({ band: 6.5, feedback: 'Solid response overall.' });
      scoreCreate.mockResolvedValue({
        skill: 'WRITING',
        score: 6.5,
        feedback: 'Solid response overall.',
      });
      const service = buildService();

      const result = await service.submitSectionResponse(caller, attemptId, 'WRITING', {
        text: 'The chart shows a steady increase.',
      });

      expect(scoreExamSection).toHaveBeenCalledWith({
        skill: 'WRITING',
        taskPrompt: 'Describe a chart.',
        learnerResponse: 'The chart shows a steady increase.',
      });
      expect(result).toEqual({ skill: 'WRITING', score: 6.5, feedback: 'Solid response overall.' });
    });

    it('joins SPEAKING prompts into a single taskPrompt for ai-engine', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindUnique.mockResolvedValue({
        id: sectionId,
        skill: 'SPEAKING',
        content: { prompts: ['Tell me about your hometown.', 'Describe a skill.'] },
      });
      scoreFindUnique.mockResolvedValue(null);
      scoreExamSection.mockResolvedValue({ band: 7, feedback: 'Fluent and coherent.' });
      scoreCreate.mockResolvedValue({
        skill: 'SPEAKING',
        score: 7,
        feedback: 'Fluent and coherent.',
      });
      const service = buildService();

      await service.submitSectionResponse(caller, attemptId, 'SPEAKING', {
        text: 'My transcript.',
      });

      expect(scoreExamSection).toHaveBeenCalledWith({
        skill: 'SPEAKING',
        taskPrompt: 'Tell me about your hometown. Describe a skill.',
        learnerResponse: 'My transcript.',
      });
    });

    it('throws ConflictException submitting a response for an already-scored section', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindUnique.mockResolvedValue({
        id: sectionId,
        skill: 'READING',
        content: { questions: [] },
      });
      scoreFindUnique.mockResolvedValue({ id: 'existing-score' });
      const service = buildService();

      await expect(
        service.submitSectionResponse(caller, attemptId, 'READING', { answers: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(scoreCreate).not.toHaveBeenCalled();
    });

    it('throws ConflictException submitting a response to an attempt that is not IN_PROGRESS', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt({ status: 'COMPLETED' }));
      const service = buildService();

      await expect(
        service.submitSectionResponse(caller, attemptId, 'READING', { answers: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException submitting "text" for an objectively-scored skill', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindUnique.mockResolvedValue({
        id: sectionId,
        skill: 'READING',
        content: { questions: [] },
      });
      scoreFindUnique.mockResolvedValue(null);
      const service = buildService();

      await expect(
        service.submitSectionResponse(caller, attemptId, 'READING', { text: 'not valid here' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when no section exists for that skill under this exam program', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindUnique.mockResolvedValue(null);
      const service = buildService();

      await expect(
        service.submitSectionResponse(caller, attemptId, 'READING', { answers: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('complete', () => {
    it('is idempotent — returns the already-completed attempt without recomputing anything, and no new certificate token', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt({ status: 'COMPLETED', overallScore: 6.5 }));
      const service = buildService();

      const result = await service.complete(caller, attemptId);

      expect(result.status).toBe('COMPLETED');
      expect(result.certificateVerificationToken).toBeNull();
      expect(sectionFindMany).not.toHaveBeenCalled();
      expect(issueCertificate).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });

    it('throws ConflictException when not every section has been scored yet', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindMany.mockResolvedValue([{}, {}, {}, {}]);
      scoreFindMany.mockResolvedValue([{ score: 7 }]);
      const service = buildService();

      await expect(service.complete(caller, attemptId)).rejects.toBeInstanceOf(ConflictException);
      expect(attemptUpdate).not.toHaveBeenCalled();
      expect(issueCertificate).not.toHaveBeenCalled();
    });

    it('computes the real overall band as the mean of every section score, rounded to the nearest 0.5, issues a real Certificate via the shared CertificateService, and publishes exam.mock_test.completed', async () => {
      attemptFindUnique.mockResolvedValue(baseAttempt());
      sectionFindMany.mockResolvedValue([{}, {}, {}, {}]);
      scoreFindMany.mockResolvedValue([{ score: 7 }, { score: 6.5 }, { score: 7 }, { score: 6 }]);
      attemptUpdate.mockResolvedValue(baseAttempt({ status: 'COMPLETED', overallScore: 6.5 }));
      issueCertificate.mockResolvedValue({
        rawToken: 'real-raw-token',
        certificate: { id: 'cert-1' },
      });
      const service = buildService();

      const result = await service.complete(caller, attemptId);

      // mean = (7 + 6.5 + 7 + 6) / 4 = 6.625 -> rounds to 6.5
      expect(attemptUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', overallScore: 6.5 }),
        }),
      );
      expect(issueCertificate).toHaveBeenCalledWith(userId, { examProgramId });
      expect(result.certificateVerificationToken).toBe('real-raw-token');
      expect(publish).toHaveBeenCalledWith('exam.mock_test.completed', {
        userId,
        payload: { mockTestAttemptId: attemptId, examProgramId, overallScore: 6.5 },
      });
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('list', () => {
    it("scopes the query to the caller's own attempts, newest first, paginated", async () => {
      attemptFindMany.mockResolvedValue([baseAttempt({ status: 'COMPLETED', overallScore: 6.5 })]);
      attemptCount.mockResolvedValue(1);
      const service = buildService();

      const result = await service.list(caller, { page: 1, pageSize: 20 });

      expect(attemptFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('computes the correct offset for page 2', async () => {
      attemptFindMany.mockResolvedValue([]);
      attemptCount.mockResolvedValue(0);
      const service = buildService();

      await service.list(caller, { page: 2, pageSize: 10 });

      expect(attemptFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    });
  });
});
