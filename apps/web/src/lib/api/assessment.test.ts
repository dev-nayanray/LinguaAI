import { describe, expect, it, vi } from 'vitest';

import {
  completeAssessmentAttempt,
  startAssessmentAttempt,
  submitAssessmentResponse,
} from './assessment';

const requestMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

describe('startAssessmentAttempt', () => {
  it('posts a PLACEMENT attempt for the given language', async () => {
    const response = { attempt: { id: 'attempt-1' }, nextItem: { id: 'item-1' } };
    requestMock.mockResolvedValueOnce(response);

    const result = await startAssessmentAttempt('lang-1');

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/assessment-attempts', {
      method: 'POST',
      body: { languageId: 'lang-1', type: 'PLACEMENT' },
    });
  });
});

describe('submitAssessmentResponse', () => {
  it('posts the response to the real attempt/item path', async () => {
    const response = {
      response: { id: 'r-1', isCorrect: true, score: 1 },
      nextItem: null,
      attemptStatus: 'COMPLETED',
    };
    requestMock.mockResolvedValueOnce(response);

    const result = await submitAssessmentResponse('attempt-1', {
      itemId: 'item-1',
      response: { text: 'hola' },
    });

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/assessment-attempts/attempt-1/responses', {
      method: 'POST',
      body: { itemId: 'item-1', response: { text: 'hola' } },
    });
  });
});

describe('completeAssessmentAttempt', () => {
  it('posts to the real complete endpoint', async () => {
    const response = {
      attempt: {},
      responses: [],
      proficiencyLevels: [],
      retakeRecommended: false,
    };
    requestMock.mockResolvedValueOnce(response);

    const result = await completeAssessmentAttempt('attempt-1');

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/assessment-attempts/attempt-1/complete', {
      method: 'POST',
    });
  });
});
