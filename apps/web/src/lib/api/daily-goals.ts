import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@linguaai/auth-client';
import type { DailyGoalResponse } from '@linguaai/validation/learning';

import { authClient } from '@/lib/auth-client';

/**
 * `GET /v1/daily-goals/today` (E7 T5) — 404s when the recommendation
 * engine hasn't generated today's goal yet (a real, ordinary case for a
 * brand-new account, not an error) — resolved to `null` here so the
 * dashboard renders its own real empty state instead of an error banner.
 */
export async function fetchTodayDailyGoal(): Promise<DailyGoalResponse | null> {
  try {
    return await authClient.request<DailyGoalResponse>('/v1/daily-goals/today');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export function useTodayDailyGoal() {
  return useQuery({
    queryKey: ['daily-goal', 'today'],
    queryFn: fetchTodayDailyGoal,
  });
}
