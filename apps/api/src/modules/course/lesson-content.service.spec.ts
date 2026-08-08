import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { LessonContentService } from './lesson-content.service.js';
import type { ContentVersioningService } from './content-versioning.service.js';

const LESSON = {
  id: 'lesson-1',
  unitId: 'unit-1',
  title: 'Saying Hello',
  description: null,
  order: 1,
  estimatedMinutes: 5,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};
const ACTIVITY = {
  id: 'activity-1',
  lessonId: 'lesson-1',
  type: 'READING',
  title: 'Basic Greetings',
  content: { text: 'Hola' },
  order: 1,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};
const QUIZ = {
  id: 'quiz-1',
  activityId: 'activity-1',
  title: 'Quiz 1',
  passingScorePercent: 80,
  order: 1,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};
const EXERCISE = {
  id: 'ex-1',
  activityId: 'activity-1',
  quizId: null,
  type: 'MULTIPLE_CHOICE',
  prompt: 'Choose the greeting',
  correctAnswer: { correctIndex: 0 },
  order: 1,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    unit: { findUnique: jest.fn() },
    lesson: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(LESSON),
      update: jest.fn().mockResolvedValue(LESSON),
    },
    activity: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(ACTIVITY),
      update: jest.fn().mockResolvedValue(ACTIVITY),
    },
    quiz: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(QUIZ),
      update: jest.fn().mockResolvedValue(QUIZ),
    },
    exercise: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(EXERCISE),
      update: jest.fn().mockResolvedValue(EXERCISE),
    },
  };
}

function fakeVersioning(): jest.Mocked<
  Pick<
    ContentVersioningService,
    'getCourseIdForLesson' | 'getCourseIdForActivity' | 'snapshotIfPublished'
  >
> {
  return {
    getCourseIdForLesson: jest.fn().mockResolvedValue('course-1'),
    getCourseIdForActivity: jest.fn().mockResolvedValue('course-1'),
    snapshotIfPublished: jest.fn().mockResolvedValue(undefined),
  };
}

describe('LessonContentService', () => {
  describe('Lesson', () => {
    it('createLesson throws 404 when the owning unit does not exist', async () => {
      const prisma = fakePrisma();
      prisma.unit.findUnique.mockResolvedValue(null);
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(
        service.createLesson('missing', { title: 'Saying Hello', order: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateLesson calls snapshotIfPublished with the fresh field values', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue(LESSON);
      const versioning = fakeVersioning();
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        versioning as unknown as ContentVersioningService,
      );

      await service.updateLesson('lesson-1', { title: 'Saying Hello' });

      expect(versioning.snapshotIfPublished).toHaveBeenCalledWith(
        'LESSON',
        'lesson-1',
        'course-1',
        expect.objectContaining({ id: 'lesson-1' }) as unknown,
      );
    });

    it('deleteLesson throws 404 for a missing lesson', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue(null);
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.deleteLesson('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Activity', () => {
    it('createActivity throws 404 when the owning lesson does not exist', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue(null);
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(
        service.createActivity('missing', {
          type: 'READING',
          title: 'Basic Greetings',
          content: {},
          order: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateActivity snapshots only when its course is published', async () => {
      const prisma = fakePrisma();
      prisma.activity.findUnique.mockResolvedValue(ACTIVITY);
      const versioning = fakeVersioning();
      versioning.getCourseIdForActivity.mockResolvedValue('course-1');
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        versioning as unknown as ContentVersioningService,
      );

      await service.updateActivity('activity-1', { title: 'Updated title' });

      expect(versioning.snapshotIfPublished).toHaveBeenCalledWith(
        'ACTIVITY',
        'activity-1',
        'course-1',
        expect.objectContaining({ id: 'activity-1' }) as unknown,
      );
    });
  });

  describe('Quiz', () => {
    it('createQuiz throws 404 when the owning activity does not exist', async () => {
      const prisma = fakePrisma();
      prisma.activity.findUnique.mockResolvedValue(null);
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.createQuiz('missing', { title: 'Quiz 1', order: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("updateQuiz resolves the owning course via the quiz's own activityId", async () => {
      const prisma = fakePrisma();
      prisma.quiz.findUnique.mockResolvedValue(QUIZ);
      const versioning = fakeVersioning();
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        versioning as unknown as ContentVersioningService,
      );

      await service.updateQuiz('quiz-1', { title: 'Updated Quiz' });

      expect(versioning.getCourseIdForActivity).toHaveBeenCalledWith('activity-1');
      expect(versioning.snapshotIfPublished).toHaveBeenCalledWith(
        'QUIZ',
        'quiz-1',
        'course-1',
        expect.objectContaining({ id: 'quiz-1' }) as unknown,
      );
    });
  });

  describe('Exercise', () => {
    it('createExercise throws 404 when the owning activity does not exist', async () => {
      const prisma = fakePrisma();
      prisma.activity.findUnique.mockResolvedValue(null);
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(
        service.createExercise('missing', {
          type: 'MULTIPLE_CHOICE',
          prompt: 'p',
          correctAnswer: {},
          order: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("updateExercise resolves the owning course via the exercise's own activityId and snapshots it", async () => {
      const prisma = fakePrisma();
      prisma.exercise.findUnique.mockResolvedValue(EXERCISE);
      const versioning = fakeVersioning();
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        versioning as unknown as ContentVersioningService,
      );

      await service.updateExercise('ex-1', { prompt: 'Updated prompt' });

      expect(versioning.getCourseIdForActivity).toHaveBeenCalledWith('activity-1');
      expect(versioning.snapshotIfPublished).toHaveBeenCalledWith(
        'EXERCISE',
        'ex-1',
        'course-1',
        expect.objectContaining({ id: 'ex-1' }) as unknown,
      );
    });

    it('deleteExercise throws 404 for a missing exercise', async () => {
      const prisma = fakePrisma();
      prisma.exercise.findUnique.mockResolvedValue(null);
      const service = new LessonContentService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.deleteExercise('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
