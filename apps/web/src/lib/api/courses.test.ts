import { describe, expect, it, vi } from 'vitest';

import {
  fetchCourseDetail,
  fetchCourses,
  fetchLessonDetail,
  submitExerciseAttempt,
} from './courses';

const requestMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

describe('fetchCourses', () => {
  it('requests GET /v1/courses via the shared authenticated client', async () => {
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchCourses();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/courses');
  });
});

describe('fetchCourseDetail', () => {
  it('requests GET /v1/courses/:id', async () => {
    const response = { id: 'course-1', levels: [] };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchCourseDetail('course-1');

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/courses/course-1');
  });
});

describe('fetchLessonDetail', () => {
  it('requests GET /v1/lessons/:id', async () => {
    const response = { id: 'lesson-1', activities: [] };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchLessonDetail('lesson-1');

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/lessons/lesson-1');
  });
});

describe('submitExerciseAttempt', () => {
  it('posts { response } to /v1/exercises/:id/attempts', async () => {
    const response = { id: 'attempt-1', isCorrect: true, score: 1 };
    requestMock.mockResolvedValueOnce(response);

    const result = await submitExerciseAttempt('ex-1', { text: 'hola' });

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/exercises/ex-1/attempts', {
      method: 'POST',
      body: { response: { text: 'hola' } },
    });
  });
});
