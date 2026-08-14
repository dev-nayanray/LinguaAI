import { describe, expect, it, vi } from 'vitest';

import { fetchCourses } from './courses';

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
