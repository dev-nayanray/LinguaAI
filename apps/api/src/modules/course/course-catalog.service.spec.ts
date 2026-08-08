import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { CourseCatalogService } from './course-catalog.service.js';

const PUBLISHED_COURSE = {
  id: 'course-1',
  languageId: 'lang-1',
  title: 'Spanish for Travel',
  description: null,
  slug: 'spanish-for-travel',
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    course: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
  };
}

describe('CourseCatalogService', () => {
  describe('listCourses', () => {
    it('only returns published, non-deleted courses, with pagination metadata', async () => {
      const prisma = fakePrisma();
      prisma.course.findMany.mockResolvedValue([PUBLISHED_COURSE]);
      prisma.course.count.mockResolvedValue(1);
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      const result = await service.listCourses({ page: 1, pageSize: 20 });

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publishedAt: { not: null }, deletedAt: null },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: [expect.objectContaining({ id: 'course-1' }) as unknown],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('adds a languageId filter when provided', async () => {
      const prisma = fakePrisma();
      prisma.course.findMany.mockResolvedValue([]);
      prisma.course.count.mockResolvedValue(0);
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      await service.listCourses({ languageId: 'lang-1', page: 2, pageSize: 10 });

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publishedAt: { not: null }, deletedAt: null, languageId: 'lang-1' },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getCourseDetail', () => {
    it('returns the nested Level/Unit/Lesson outline for a published course', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({
        ...PUBLISHED_COURSE,
        levels: [
          {
            id: 'level-1',
            courseId: 'course-1',
            cefrLevel: 'A1',
            title: 'Beginner',
            description: null,
            order: 1,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            units: [
              {
                id: 'unit-1',
                levelId: 'level-1',
                title: 'Greetings',
                description: null,
                order: 1,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                lessons: [
                  {
                    id: 'lesson-1',
                    unitId: 'unit-1',
                    title: 'Saying Hello',
                    description: null,
                    order: 1,
                    estimatedMinutes: 5,
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                  },
                ],
              },
            ],
          },
        ],
      });
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      const result = await service.getCourseDetail('course-1');

      expect(result.levels).toHaveLength(1);
      expect(result.levels[0]?.units[0]?.lessons[0]?.id).toBe('lesson-1');
    });

    it('throws 404 for a draft (unpublished) course', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({
        ...PUBLISHED_COURSE,
        publishedAt: null,
        levels: [],
      });
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      await expect(service.getCourseDetail('course-1')).rejects.toThrow(NotFoundException);
    });

    it('throws 404 for a missing course', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(null);
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      await expect(service.getCourseDetail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLessonDetail', () => {
    const publishedLesson = {
      id: 'lesson-1',
      unitId: 'unit-1',
      title: 'Saying Hello',
      description: null,
      order: 1,
      estimatedMinutes: 5,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      unit: { level: { course: PUBLISHED_COURSE } },
      activities: [
        {
          id: 'activity-1',
          lessonId: 'lesson-1',
          type: 'READING',
          title: 'Basic Greetings',
          content: { text: 'Hola' },
          order: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          exercises: [
            {
              id: 'ex-1',
              activityId: 'activity-1',
              quizId: null,
              type: 'MULTIPLE_CHOICE',
              prompt: 'Choose the greeting',
              correctAnswer: { correctIndex: 0 },
              order: 1,
            },
          ],
          quizzes: [],
        },
      ],
    };

    it("returns the lesson's own activities/exercises, never leaking correctAnswer", async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue(publishedLesson);
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      const result = await service.getLessonDetail('lesson-1');

      const exercise = result.activities[0]?.exercises[0] as unknown as Record<string, unknown>;
      expect(exercise.id).toBe('ex-1');
      expect(exercise.correctAnswer).toBeUndefined();
    });

    it("throws 404 when the lesson's own course is a draft", async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue({
        ...publishedLesson,
        unit: { level: { course: { ...PUBLISHED_COURSE, publishedAt: null } } },
      });
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      await expect(service.getLessonDetail('lesson-1')).rejects.toThrow(NotFoundException);
    });

    it('throws 404 for a missing lesson', async () => {
      const prisma = fakePrisma();
      prisma.lesson.findUnique.mockResolvedValue(null);
      const service = new CourseCatalogService(prisma as unknown as PrismaClient);

      await expect(service.getLessonDetail('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
