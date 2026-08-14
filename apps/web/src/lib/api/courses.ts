import { useQuery } from '@tanstack/react-query';
import type { CourseListResponse } from '@linguaai/validation/content';

import { authClient } from '@/lib/auth-client';

/** `GET /v1/courses` (E8 T2) — the real, published course catalog. */
export function fetchCourses(): Promise<CourseListResponse> {
  return authClient.request<CourseListResponse>('/v1/courses');
}

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: fetchCourses,
  });
}
