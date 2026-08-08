import type { CourseListResponse } from '@linguaai/validation/content';

import { CourseCatalogController } from './course-catalog.controller.js';
import type { CourseCatalogService } from './course-catalog.service.js';

function fakeService(): jest.Mocked<CourseCatalogService> {
  return {
    listCourses: jest.fn(),
    getCourseDetail: jest.fn(),
    getLessonDetail: jest.fn(),
  } as unknown as jest.Mocked<CourseCatalogService>;
}

describe('CourseCatalogController', () => {
  it('listCourses delegates to the service with the query', async () => {
    const response: CourseListResponse = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    const service = fakeService();
    service.listCourses.mockResolvedValue(response);
    const controller = new CourseCatalogController(service);
    const query = { page: 1, pageSize: 20 };

    const result = await controller.listCourses(query);

    expect(service.listCourses).toHaveBeenCalledWith(query);
    expect(result).toBe(response);
  });

  it('getCourseDetail delegates to the service', async () => {
    const service = fakeService();
    const controller = new CourseCatalogController(service);

    await controller.getCourseDetail('course-1');

    expect(service.getCourseDetail).toHaveBeenCalledWith('course-1');
  });

  it('getLessonDetail delegates to the service', async () => {
    const service = fakeService();
    const controller = new CourseCatalogController(service);

    await controller.getLessonDetail('lesson-1');

    expect(service.getLessonDetail).toHaveBeenCalledWith('lesson-1');
  });
});
