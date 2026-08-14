import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CourseDetailResponse,
  CourseListResponse,
  ExerciseAttemptResultResponse,
  LessonDetailResponse,
  SubmitExerciseAttemptRequest,
} from '@linguaai/validation/content';

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

/** `GET /v1/courses/:id` (E8 T2) — Levels -> Units -> Lessons, shallow. */
export function fetchCourseDetail(courseId: string): Promise<CourseDetailResponse> {
  return authClient.request<CourseDetailResponse>(`/v1/courses/${courseId}`);
}

export function useCourseDetail(courseId: string) {
  return useQuery({
    queryKey: ['courses', courseId],
    queryFn: () => fetchCourseDetail(courseId),
  });
}

/** `GET /v1/lessons/:id` (E8 T2) — a Lesson's own Activities/Exercises/Quizzes. */
export function fetchLessonDetail(lessonId: string): Promise<LessonDetailResponse> {
  return authClient.request<LessonDetailResponse>(`/v1/lessons/${lessonId}`);
}

export function useLessonDetail(lessonId: string) {
  return useQuery({
    queryKey: ['lessons', lessonId],
    queryFn: () => fetchLessonDetail(lessonId),
  });
}

/**
 * `POST /v1/exercises/:id/attempts` (E8 T2) — real, deterministic scoring.
 * `exercisePublicViewSchema` on this branch carries no `content` field yet
 * (the options/leftItems/rightItems a MULTIPLE_CHOICE/MATCHING exercise
 * needs to render at all — a real, disclosed gap, see docs/WEB_DESIGN.md),
 * so only FILL_BLANK/TRANSLATION (free-text) exercises are answerable
 * through this UI today; the exercise page itself enforces that, not this
 * fetcher.
 */
export function submitExerciseAttempt(
  exerciseId: string,
  response: SubmitExerciseAttemptRequest['response'],
): Promise<ExerciseAttemptResultResponse> {
  return authClient.request<ExerciseAttemptResultResponse>(`/v1/exercises/${exerciseId}/attempts`, {
    method: 'POST',
    body: { response },
  });
}

export function useSubmitExerciseAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseId,
      response,
    }: {
      exerciseId: string;
      response: SubmitExerciseAttemptRequest['response'];
    }) => submitExerciseAttempt(exerciseId, response),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-goal'] });
    },
  });
}
