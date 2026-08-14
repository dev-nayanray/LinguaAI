import { NotFoundException } from '@nestjs/common';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { MockTestAttemptsService } from './mock-test-attempts.service.js';

const examProgramId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-08-14T00:00:00.000Z');
const caller: RequestUser = { userId, role: 'LEARNER', organizationId: null, orgRole: null };

describe('MockTestAttemptsService', () => {
  const examProgramFindUnique = jest.fn();
  const attemptCreate = jest.fn();
  const attemptFindUnique = jest.fn();
  const sectionFindMany = jest.fn();
  const prisma = {
    examProgram: { findUnique: examProgramFindUnique },
    mockTestAttempt: { create: attemptCreate, findUnique: attemptFindUnique },
    mockTestSection: { findMany: sectionFindMany },
  };

  function buildService(): MockTestAttemptsService {
    return new MockTestAttemptsService(prisma as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts an attempt and strips correctIndex from every READING/LISTENING question, leaving WRITING/SPEAKING untouched', async () => {
    examProgramFindUnique.mockResolvedValue({ id: examProgramId, isActive: true });
    attemptCreate.mockResolvedValue({
      id: attemptId,
      userId,
      examProgramId,
      status: 'IN_PROGRESS',
      overallScore: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
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
    attemptFindUnique.mockResolvedValue({
      id: attemptId,
      userId: 'someone-else',
      examProgramId,
      status: 'IN_PROGRESS',
      overallScore: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const service = buildService();

    await expect(service.get(caller, attemptId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the caller's own attempt", async () => {
    attemptFindUnique.mockResolvedValue({
      id: attemptId,
      userId,
      examProgramId,
      status: 'IN_PROGRESS',
      overallScore: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const service = buildService();

    const result = await service.get(caller, attemptId);

    expect(result.id).toBe(attemptId);
  });
});
