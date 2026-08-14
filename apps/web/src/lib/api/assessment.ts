import { useMutation } from '@tanstack/react-query';
import type {
  CompleteAssessmentAttemptResponse,
  StartAssessmentAttemptResponse,
  SubmitAssessmentResponseRequest,
  SubmitAssessmentResponseResponse,
} from '@linguaai/validation/learning';

import { authClient } from '@/lib/auth-client';

/** `POST /v1/assessment-attempts` (E6 T2) — starts a placement/re-assessment attempt. */
export function startAssessmentAttempt(
  languageId: string,
): Promise<StartAssessmentAttemptResponse> {
  return authClient.request<StartAssessmentAttemptResponse>('/v1/assessment-attempts', {
    method: 'POST',
    body: { languageId, type: 'PLACEMENT' },
  });
}

export function useStartAssessmentAttempt() {
  return useMutation({ mutationFn: startAssessmentAttempt });
}

/** `POST /v1/assessment-attempts/:id/responses` (E6 T2). */
export function submitAssessmentResponse(
  attemptId: string,
  body: SubmitAssessmentResponseRequest,
): Promise<SubmitAssessmentResponseResponse> {
  return authClient.request<SubmitAssessmentResponseResponse>(
    `/v1/assessment-attempts/${attemptId}/responses`,
    { method: 'POST', body },
  );
}

export function useSubmitAssessmentResponse() {
  return useMutation({
    mutationFn: ({
      attemptId,
      body,
    }: {
      attemptId: string;
      body: SubmitAssessmentResponseRequest;
    }) => submitAssessmentResponse(attemptId, body),
  });
}

/** `POST /v1/assessment-attempts/:id/complete` (E6 T3) — idempotent, returns the banded proficiency result. */
export function completeAssessmentAttempt(
  attemptId: string,
): Promise<CompleteAssessmentAttemptResponse> {
  return authClient.request<CompleteAssessmentAttemptResponse>(
    `/v1/assessment-attempts/${attemptId}/complete`,
    { method: 'POST' },
  );
}

export function useCompleteAssessmentAttempt() {
  return useMutation({ mutationFn: completeAssessmentAttempt });
}
