import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { CourseHierarchyService } from './course-hierarchy.service.js';
import type { ContentVersioningService } from './content-versioning.service.js';

const COURSE = {
  id: 'course-1',
  languageId: 'lang-1',
  title: 'Spanish for Travel',
  description: null,
  slug: 'spanish-for-travel',
  publishedAt: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const LEVEL = {
  id: 'level-1',
  courseId: 'course-1',
  cefrLevel: 'A1',
  title: 'Beginner',
  description: null,
  order: 1,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const UNIT = {
  id: 'unit-1',
  levelId: 'level-1',
  title: 'Greetings',
  description: null,
  order: 1,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function fakePrisma() {
  const prisma: {
    course: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    level: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    unit: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  } = {
    course: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(COURSE),
      update: jest.fn().mockResolvedValue(COURSE),
    },
    level: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(LEVEL),
      update: jest.fn().mockResolvedValue(LEVEL),
    },
    unit: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(UNIT),
      update: jest.fn().mockResolvedValue(UNIT),
    },
    // The real Prisma `tx` client has the same shape as the top-level
    // client — passing `prisma` itself back matches that, so
    // `tx.course.update(...)` inside `publishCourse`'s own transaction
    // callback resolves to this same mock.
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  return prisma;
}

function fakeVersioning(): jest.Mocked<
  Pick<ContentVersioningService, 'backfillVersionsForCourse'>
> {
  return { backfillVersionsForCourse: jest.fn().mockResolvedValue(undefined) };
}

describe('CourseHierarchyService', () => {
  describe('Course', () => {
    it('createCourse creates a draft course', async () => {
      const prisma = fakePrisma();
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      const result = await service.createCourse({
        languageId: 'lang-1',
        title: 'Spanish for Travel',
        slug: 'spanish-for-travel',
      });

      expect(prisma.course.create).toHaveBeenCalled();
      expect(result.publishedAt).toBeNull();
    });

    it('updateCourse throws 404 for a missing course', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(null);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.updateCourse('missing', { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updateCourse throws 404 for a soft-deleted course', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue({ ...COURSE, deletedAt: new Date() });
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.updateCourse('course-1', { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('publishCourse sets publishedAt and runs the version backfill exactly once', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(COURSE);
      const versioning = fakeVersioning();
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        versioning as unknown as ContentVersioningService,
      );

      await service.publishCourse('course-1');

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedAt: expect.any(Date) as Date }),
        }),
      );
      expect(versioning.backfillVersionsForCourse).toHaveBeenCalledTimes(1);
    });

    it('publishCourse is idempotent on publishedAt — a re-publish does not overwrite the original timestamp, but still backfills', async () => {
      const prisma = fakePrisma();
      const alreadyPublished = { ...COURSE, publishedAt: new Date('2026-01-01T00:00:00.000Z') };
      prisma.course.findUnique.mockResolvedValue(alreadyPublished);
      const versioning = fakeVersioning();
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        versioning as unknown as ContentVersioningService,
      );

      await service.publishCourse('course-1');

      expect(prisma.course.update).not.toHaveBeenCalled();
      expect(versioning.backfillVersionsForCourse).toHaveBeenCalledTimes(1);
    });

    it('deleteCourse soft-deletes via deletedAt', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(COURSE);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await service.deleteCourse('course-1');

      expect(prisma.course.update).toHaveBeenCalledWith({
        where: { id: 'course-1' },
        data: { deletedAt: expect.any(Date) as Date },
      });
    });
  });

  describe('Level', () => {
    it('createLevel throws 404 when the owning course does not exist', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(null);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(
        service.createLevel('missing', { cefrLevel: 'A1', title: 'Beginner', order: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('createLevel creates a Level under an existing course', async () => {
      const prisma = fakePrisma();
      prisma.course.findUnique.mockResolvedValue(COURSE);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      const result = await service.createLevel('course-1', {
        cefrLevel: 'A1',
        title: 'Beginner',
        order: 1,
      });

      expect(result.courseId).toBe('course-1');
    });

    it('deleteLevel throws 404 for a missing level', async () => {
      const prisma = fakePrisma();
      prisma.level.findUnique.mockResolvedValue(null);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.deleteLevel('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Unit', () => {
    it('createUnit throws 404 when the owning level does not exist', async () => {
      const prisma = fakePrisma();
      prisma.level.findUnique.mockResolvedValue(null);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.createUnit('missing', { title: 'Greetings', order: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('createUnit creates a Unit under an existing level', async () => {
      const prisma = fakePrisma();
      prisma.level.findUnique.mockResolvedValue(LEVEL);
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      const result = await service.createUnit('level-1', { title: 'Greetings', order: 1 });

      expect(result.levelId).toBe('level-1');
    });

    it('updateUnit throws 404 for a soft-deleted unit', async () => {
      const prisma = fakePrisma();
      prisma.unit.findUnique.mockResolvedValue({ ...UNIT, deletedAt: new Date() });
      const service = new CourseHierarchyService(
        prisma as unknown as PrismaClient,
        fakeVersioning() as unknown as ContentVersioningService,
      );

      await expect(service.updateUnit('unit-1', { title: 'x' })).rejects.toThrow(NotFoundException);
    });
  });
});
