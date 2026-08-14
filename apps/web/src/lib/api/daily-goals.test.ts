import { ApiError } from '@linguaai/auth-client';
import { describe, expect, it, vi } from 'vitest';

import { fetchTodayDailyGoal } from './daily-goals';

const requestMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

describe('fetchTodayDailyGoal', () => {
  it('requests GET /v1/daily-goals/today and returns the real goal', async () => {
    const goal = { id: 'goal-1', targetXp: 50 };
    requestMock.mockResolvedValueOnce(goal);

    const result = await fetchTodayDailyGoal();

    expect(result).toBe(goal);
    expect(requestMock).toHaveBeenCalledWith('/v1/daily-goals/today');
  });

  it('resolves to null on a 404 (no goal generated yet) instead of throwing', async () => {
    requestMock.mockRejectedValueOnce(
      new ApiError(404, { error: { code: 'NOT_FOUND', message: 'No daily goal for today' } }),
    );

    await expect(fetchTodayDailyGoal()).resolves.toBeNull();
  });

  it('rethrows any other error (e.g. a real 500)', async () => {
    requestMock.mockRejectedValueOnce(
      new ApiError(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    );

    await expect(fetchTodayDailyGoal()).rejects.toMatchObject({ status: 500 });
  });
});
