import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { ExerciseAttemptsService } from './exercise-attempts.service.js';
import type { ContentVersioningService } from './content-versioning.service.js';

const USER: RequestUser = { userId: 'user-1', role: 'USER', organizationId: null, orgRole: null };

const EXERCISE = {
  id: 'ex-1',
  activityId: 'activity-1',
  quizId: null,
  type: 'MULTIPLE_CHOICE',
  prompt: 'Choose the greeting',
  correctAnswer: { correctIndex: 0 },
  order: 1,
  deletedAt: null,
};

function fakePrisma() {
  return {
    exercise: { findUnique: jest.fn() },
    exerciseAttempt: { create: jest.fn() },
  };
}

function fakeVersioning(): jest.Mocked<
  Pick<
    ContentVersioningService,
    'getCourseIdForActivity' | 'isCoursePublished' | 'getCurrentVersionId'
  >
> {
  return {
    getCourseIdForActivity: jest.fn().mockResolvedValue('course-1'),
    isCoursePublished: jest.fn().mockResolvedValue(true),
    getCurrentVersionId: jest.fn().mockResolvedValue('version-1'),
  };
}

describe('ExerciseAttemptsService', () => {
  it('scores a correct response and pins the attempt to the current ContentVersion', async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
    prisma.exerciseAttempt.create.mockResolvedValue({
      id: 'attempt-1',
      isCorrect: true,
      score: 1,
    });
    const versioning = fakeVersioning();
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      versioning as unknown as ContentVersioningService,
    );

    const result = await service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } });

    expect(result).toEqual({ id: 'attempt-1', isCorrect: true, score: 1 });
    expect(prisma.exerciseAttempt.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        exerciseId: 'ex-1',
        contentVersionId: 'version-1',
        response: { selectedIndex: 0 },
        isCorrect: true,
        score: 1,
      },
    });
  });

  it('throws 404 when the exercise does not exist', async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue(null);
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      fakeVersioning() as unknown as ContentVersioningService,
    );

    await expect(
      service.submitAttempt(USER, 'missing', { response: { selectedIndex: 0 } }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws 404 (not leaking existence) when the exercise's own course is still a draft", async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
    const versioning = fakeVersioning();
    versioning.isCoursePublished.mockResolvedValue(false);
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      versioning as unknown as ContentVersioningService,
    );

    await expect(
      service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.exerciseAttempt.create).not.toHaveBeenCalled();
  });

  it("throws 422 for a SPEAKING_PROMPT exercise (out of this epic's own scope)", async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue({ ...EXERCISE, type: 'SPEAKING_PROMPT' });
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      fakeVersioning() as unknown as ContentVersioningService,
    );

    await expect(
      service.submitAttempt(USER, 'ex-1', { response: { text: 'transcript' } }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
