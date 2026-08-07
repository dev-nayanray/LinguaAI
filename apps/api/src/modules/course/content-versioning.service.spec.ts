import type { PrismaClient } from '@linguaai/database';

import { ContentVersioningService } from './content-versioning.service.js';

function fakePrisma() {
  return {
    course: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn(), findMany: jest.fn() },
    activity: { findUnique: jest.fn() },
    contentVersion: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({}) },
  };
}

describe('ContentVersioningService', () => {
  describe('isCoursePublished', () => {
    it('returns true when publishedAt is set', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({ publishedAt: new Date() });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      expect(await service.isCoursePublished('course-1')).toBe(true);
    });

    it('returns false when publishedAt is null', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({ publishedAt: null });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      expect(await service.isCoursePublished('course-1')).toBe(false);
    });

    it('returns false when the course does not exist', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(null);
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      expect(await service.isCoursePublished('missing')).toBe(false);
    });
  });

  describe('getCourseIdForLesson / getCourseIdForActivity', () => {
    it('walks lesson -> unit -> level -> course', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue({ unit: { level: { courseId: 'course-1' } } });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      expect(await service.getCourseIdForLesson('lesson-1')).toBe('course-1');
      expect(prisma.lesson.findUnique).toHaveBeenCalledWith({
        where: { id: 'lesson-1' },
        select: { unit: { select: { level: { select: { courseId: true } } } } },
      });
    });

    it('walks activity -> lesson -> unit -> level -> course', async () => {
      const prisma = fakePrisma();
      prisma.activity.findUnique.mockResolvedValue({
        lesson: { unit: { level: { courseId: 'course-1' } } },
      });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      expect(await service.getCourseIdForActivity('activity-1')).toBe('course-1');
    });

    it('returns null when the entity does not exist', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue(null);
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      expect(await service.getCourseIdForLesson('missing')).toBeNull();
    });
  });

  describe('snapshotIfPublished', () => {
    it('creates a new version when the owning course is published', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({ publishedAt: new Date() });
      prisma.contentVersion.findFirst.mockResolvedValue({ versionNumber: 1 });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.snapshotIfPublished('LESSON', 'lesson-1', 'course-1', { title: 'v2' });

      expect(prisma.contentVersion.create).toHaveBeenCalledWith({
        data: {
          entityType: 'LESSON',
          entityId: 'lesson-1',
          versionNumber: 2,
          snapshot: { title: 'v2' },
        },
      });
    });

    it('does not create a version when the owning course is still a draft', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({ publishedAt: null });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.snapshotIfPublished('LESSON', 'lesson-1', 'course-1', { title: 'draft edit' });

      expect(prisma.contentVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('createNextVersion', () => {
    it('starts at version 1 when no prior version exists', async () => {
      const prisma = fakePrisma();
      prisma.contentVersion.findFirst.mockResolvedValue(null);
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.createNextVersion('EXERCISE', 'ex-1', { prompt: 'hi' });

      expect(prisma.contentVersion.create).toHaveBeenCalledWith({
        data: {
          entityType: 'EXERCISE',
          entityId: 'ex-1',
          versionNumber: 1,
          snapshot: { prompt: 'hi' },
        },
      });
    });

    it('increments from the latest existing version', async () => {
      const prisma = fakePrisma();
      prisma.contentVersion.findFirst.mockResolvedValue({ versionNumber: 4 });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.createNextVersion('EXERCISE', 'ex-1', { prompt: 'edited' });

      expect(prisma.contentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ versionNumber: 5 }) as unknown }),
      );
    });
  });

  describe('ensureVersionExists', () => {
    it('creates version 1 when no version exists yet', async () => {
      const prisma = fakePrisma();
      prisma.contentVersion.findFirst.mockResolvedValue(null);
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.ensureVersionExists('QUIZ', 'quiz-1', { title: 'Quiz 1' });

      expect(prisma.contentVersion.create).toHaveBeenCalledWith({
        data: {
          entityType: 'QUIZ',
          entityId: 'quiz-1',
          versionNumber: 1,
          snapshot: { title: 'Quiz 1' },
        },
      });
    });

    it('is a no-op when a version already exists (idempotent)', async () => {
      const prisma = fakePrisma();
      prisma.contentVersion.findFirst.mockResolvedValue({ versionNumber: 1 });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.ensureVersionExists('QUIZ', 'quiz-1', { title: 'Quiz 1' });

      expect(prisma.contentVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('backfillVersionsForCourse', () => {
    it('ensures a version exists for every lesson/activity/exercise/quiz under the course', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findMany.mockResolvedValue([
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          description: null,
          order: 1,
          estimatedMinutes: null,
          activities: [
            {
              id: 'activity-1',
              type: 'READING',
              title: 'Activity 1',
              content: {},
              order: 1,
              exercises: [
                {
                  id: 'ex-1',
                  activityId: 'activity-1',
                  quizId: null,
                  type: 'MULTIPLE_CHOICE',
                  prompt: 'p',
                  correctAnswer: {},
                  order: 1,
                },
              ],
              quizzes: [
                {
                  id: 'quiz-1',
                  activityId: 'activity-1',
                  title: 'Quiz 1',
                  passingScorePercent: 80,
                  order: 1,
                },
              ],
            },
          ],
        },
      ]);
      prisma.contentVersion.findFirst.mockResolvedValue(null);
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.backfillVersionsForCourse('course-1', prisma as never);

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unit: { level: { courseId: 'course-1' } } } }),
      );
      const entityTypes = prisma.contentVersion.create.mock.calls.map(
        (call) => (call[0] as { data: { entityType: string } }).data.entityType,
      );
      expect(entityTypes.sort()).toEqual(['ACTIVITY', 'EXERCISE', 'LESSON', 'QUIZ']);
    });

    it('skips entities that already have a version (idempotent re-publish)', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findMany.mockResolvedValue([
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          description: null,
          order: 1,
          estimatedMinutes: null,
          activities: [],
        },
      ]);
      prisma.contentVersion.findFirst.mockResolvedValue({ versionNumber: 1 });
      const service = new ContentVersioningService(prisma as unknown as PrismaClient);

      await service.backfillVersionsForCourse('course-1', prisma as never);

      expect(prisma.contentVersion.create).not.toHaveBeenCalled();
    });
  });
});
