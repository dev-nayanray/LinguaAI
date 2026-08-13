import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { DomainEventPublisher } from '@linguaai/events';
import type { PrismaClient } from '@linguaai/database';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { GamificationService } from '../gamification/index.js';
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
    exercise: { findUnique: jest.fn(), findMany: jest.fn() },
    exerciseAttempt: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    activity: { findUnique: jest.fn() },
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

function fakeEvents(): jest.Mocked<Pick<DomainEventPublisher, 'publish'>> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function fakeGamification(): jest.Mocked<Pick<GamificationService, 'recordActivity'>> {
  return { recordActivity: jest.fn().mockResolvedValue(undefined) };
}

describe('ExerciseAttemptsService', () => {
  it('scores a correct response, pins the attempt to the current ContentVersion, and publishes learning.exercise.answered', async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
    prisma.exerciseAttempt.findFirst.mockResolvedValueOnce(null); // no prior attempt
    prisma.exerciseAttempt.create.mockResolvedValue({ id: 'attempt-1', isCorrect: true, score: 1 });
    prisma.activity.findUnique.mockResolvedValue({ lessonId: 'lesson-1' });
    prisma.exercise.findMany.mockResolvedValue([{ id: 'ex-1' }]);
    prisma.exerciseAttempt.findMany.mockResolvedValue([{ exerciseId: 'ex-1' }]);
    prisma.exerciseAttempt.findFirst.mockResolvedValueOnce({ score: 1 }); // completion score lookup
    const versioning = fakeVersioning();
    const events = fakeEvents();
    const gamification = fakeGamification();
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      versioning as unknown as ContentVersioningService,
      events as unknown as DomainEventPublisher,
      gamification as unknown as GamificationService,
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
    expect(events.publish).toHaveBeenCalledWith('learning.exercise.answered', {
      userId: 'user-1',
      payload: { userId: 'user-1', exerciseId: 'ex-1', correct: true },
    });
    // E14 T1 (ADR-054) — called synchronously, in-process, for both the
    // exercise-answered and the lesson-completed signal this same call
    // triggers (every exercise in the lesson now has an attempt).
    expect(gamification.recordActivity).toHaveBeenCalledWith('user-1', {
      type: 'EXERCISE_ANSWERED',
      correct: true,
      firstAttempt: true,
    });
    expect(gamification.recordActivity).toHaveBeenCalledWith('user-1', {
      type: 'LESSON_COMPLETED',
    });
  });

  it('throws 404 when the exercise does not exist', async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue(null);
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      fakeVersioning() as unknown as ContentVersioningService,
      fakeEvents() as unknown as DomainEventPublisher,
      fakeGamification() as unknown as GamificationService,
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
    const events = fakeEvents();
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      versioning as unknown as ContentVersioningService,
      events as unknown as DomainEventPublisher,
      fakeGamification() as unknown as GamificationService,
    );

    await expect(
      service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.exerciseAttempt.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("throws 422 for a SPEAKING_PROMPT exercise (out of this epic's own scope)", async () => {
    const prisma = fakePrisma();
    prisma.exercise.findUnique.mockResolvedValue({ ...EXERCISE, type: 'SPEAKING_PROMPT' });
    const events = fakeEvents();
    const service = new ExerciseAttemptsService(
      prisma as unknown as PrismaClient,
      fakeVersioning() as unknown as ContentVersioningService,
      events as unknown as DomainEventPublisher,
      fakeGamification() as unknown as GamificationService,
    );

    await expect(
      service.submitAttempt(USER, 'ex-1', { response: { text: 'transcript' } }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(events.publish).not.toHaveBeenCalled();
  });

  describe('learning.lesson.completed emission', () => {
    it('does not publish lesson-completed when this was not the first attempt at this exercise', async () => {
      const prisma = fakePrisma();
      prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
      prisma.exerciseAttempt.findFirst.mockResolvedValueOnce({ id: 'prior-attempt' }); // a prior attempt exists
      prisma.exerciseAttempt.create.mockResolvedValue({
        id: 'attempt-2',
        isCorrect: true,
        score: 1,
      });
      const events = fakeEvents();
      const gamification = fakeGamification();
      const service = new ExerciseAttemptsService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
        events as unknown as DomainEventPublisher,
        gamification as unknown as GamificationService,
      );

      await service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } });

      expect(prisma.activity.findUnique).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledTimes(1); // exercise.answered only
      // A repeat attempt earns no XP (E14 T1, §3.3's own anti-farming rule) — recordActivity is still called (streak still updates on any real activity), just with firstAttempt: false.
      expect(gamification.recordActivity).toHaveBeenCalledWith('user-1', {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: false,
      });
      expect(gamification.recordActivity).not.toHaveBeenCalledWith('user-1', {
        type: 'LESSON_COMPLETED',
      });
      expect(events.publish).not.toHaveBeenCalledWith(
        'learning.lesson.completed',
        expect.anything(),
      );
    });

    it('does not publish lesson-completed when other exercises in the lesson are still unattempted', async () => {
      const prisma = fakePrisma();
      prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
      prisma.exerciseAttempt.findFirst.mockResolvedValueOnce(null);
      prisma.exerciseAttempt.create.mockResolvedValue({
        id: 'attempt-1',
        isCorrect: true,
        score: 1,
      });
      prisma.activity.findUnique.mockResolvedValue({ lessonId: 'lesson-1' });
      prisma.exercise.findMany.mockResolvedValue([{ id: 'ex-1' }, { id: 'ex-2' }]);
      prisma.exerciseAttempt.findMany.mockResolvedValue([{ exerciseId: 'ex-1' }]); // ex-2 still unattempted
      const events = fakeEvents();
      const service = new ExerciseAttemptsService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
        events as unknown as DomainEventPublisher,
        fakeGamification() as unknown as GamificationService,
      );

      await service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } });

      expect(events.publish).not.toHaveBeenCalledWith(
        'learning.lesson.completed',
        expect.anything(),
      );
    });

    it('publishes lesson-completed with the most-recent-attempt-per-exercise average once every exercise has an attempt', async () => {
      const prisma = fakePrisma();
      prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
      prisma.exerciseAttempt.findFirst
        .mockResolvedValueOnce(null) // no prior attempt at ex-1
        .mockResolvedValueOnce({ score: 1 }) // latest score for ex-1
        .mockResolvedValueOnce({ score: 0 }); // latest score for ex-2
      prisma.exerciseAttempt.create.mockResolvedValue({
        id: 'attempt-1',
        isCorrect: true,
        score: 1,
      });
      prisma.activity.findUnique.mockResolvedValue({ lessonId: 'lesson-1' });
      prisma.exercise.findMany.mockResolvedValue([{ id: 'ex-1' }, { id: 'ex-2' }]);
      prisma.exerciseAttempt.findMany.mockResolvedValue([
        { exerciseId: 'ex-1' },
        { exerciseId: 'ex-2' },
      ]);
      const events = fakeEvents();
      const service = new ExerciseAttemptsService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
        events as unknown as DomainEventPublisher,
        fakeGamification() as unknown as GamificationService,
      );

      await service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } });

      expect(events.publish).toHaveBeenCalledWith('learning.lesson.completed', {
        userId: 'user-1',
        payload: { userId: 'user-1', lessonId: 'lesson-1', score: 0.5 },
      });
    });

    it('excludes SPEAKING_PROMPT exercises from the completion check entirely', async () => {
      const prisma = fakePrisma();
      prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
      prisma.exerciseAttempt.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ score: 1 });
      prisma.exerciseAttempt.create.mockResolvedValue({
        id: 'attempt-1',
        isCorrect: true,
        score: 1,
      });
      prisma.activity.findUnique.mockResolvedValue({ lessonId: 'lesson-1' });
      // findMany is already called with `type: { not: 'SPEAKING_PROMPT' }` —
      // the fake only returns ex-1, simulating that filter already having
      // excluded a real SPEAKING_PROMPT sibling exercise from the set.
      prisma.exercise.findMany.mockResolvedValue([{ id: 'ex-1' }]);
      prisma.exerciseAttempt.findMany.mockResolvedValue([{ exerciseId: 'ex-1' }]);
      const events = fakeEvents();
      const service = new ExerciseAttemptsService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
        events as unknown as DomainEventPublisher,
        fakeGamification() as unknown as GamificationService,
      );

      await service.submitAttempt(USER, 'ex-1', { response: { selectedIndex: 0 } });

      expect(prisma.exercise.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: { not: 'SPEAKING_PROMPT' } }) as unknown,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'learning.lesson.completed',
        expect.objectContaining({ payload: expect.objectContaining({ score: 1 }) as unknown }),
      );
    });
  });
});
