import type { CourseResponse, LevelResponse, UnitResponse } from '@linguaai/validation/content';

import { CourseHierarchyController } from './course-hierarchy.controller.js';
import type { CourseHierarchyService } from './course-hierarchy.service.js';

const COURSE: CourseResponse = {
  id: 'course-1',
  languageId: 'lang-1',
  title: 'Spanish for Travel',
  description: null,
  slug: 'spanish-for-travel',
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LEVEL: LevelResponse = {
  id: 'level-1',
  courseId: 'course-1',
  cefrLevel: 'A1',
  title: 'Beginner',
  description: null,
  order: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const UNIT: UnitResponse = {
  id: 'unit-1',
  levelId: 'level-1',
  title: 'Greetings',
  description: null,
  order: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function fakeService(): jest.Mocked<CourseHierarchyService> {
  return {
    createCourse: jest.fn().mockResolvedValue(COURSE),
    updateCourse: jest.fn().mockResolvedValue(COURSE),
    publishCourse: jest
      .fn()
      .mockResolvedValue({ ...COURSE, publishedAt: '2026-01-02T00:00:00.000Z' }),
    deleteCourse: jest.fn().mockResolvedValue(undefined),
    createLevel: jest.fn().mockResolvedValue(LEVEL),
    updateLevel: jest.fn().mockResolvedValue(LEVEL),
    deleteLevel: jest.fn().mockResolvedValue(undefined),
    createUnit: jest.fn().mockResolvedValue(UNIT),
    updateUnit: jest.fn().mockResolvedValue(UNIT),
    deleteUnit: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CourseHierarchyService>;
}

describe('CourseHierarchyController', () => {
  it('createCourse delegates to the service', async () => {
    const service = fakeService();
    const controller = new CourseHierarchyController(service);
    const dto = { languageId: 'lang-1', title: 'Spanish for Travel', slug: 'spanish-for-travel' };

    const result = await controller.createCourse(dto);

    expect(service.createCourse).toHaveBeenCalledWith(dto);
    expect(result).toBe(COURSE);
  });

  it('publishCourse delegates to the service', async () => {
    const service = fakeService();
    const controller = new CourseHierarchyController(service);

    await controller.publishCourse('course-1');

    expect(service.publishCourse).toHaveBeenCalledWith('course-1');
  });

  it('deleteCourse delegates to the service', async () => {
    const service = fakeService();
    const controller = new CourseHierarchyController(service);

    await controller.deleteCourse('course-1');

    expect(service.deleteCourse).toHaveBeenCalledWith('course-1');
  });

  it('createLevel delegates to the service with the parent courseId', async () => {
    const service = fakeService();
    const controller = new CourseHierarchyController(service);
    const dto = { cefrLevel: 'A1' as const, title: 'Beginner', order: 1 };

    await controller.createLevel('course-1', dto);

    expect(service.createLevel).toHaveBeenCalledWith('course-1', dto);
  });

  it('createUnit delegates to the service with the parent levelId', async () => {
    const service = fakeService();
    const controller = new CourseHierarchyController(service);
    const dto = { title: 'Greetings', order: 1 };

    await controller.createUnit('level-1', dto);

    expect(service.createUnit).toHaveBeenCalledWith('level-1', dto);
  });
});
