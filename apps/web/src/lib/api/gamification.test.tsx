import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  fetchBadges,
  fetchGamificationStatus,
  fetchMissions,
  useBadges,
  useGamificationStatus,
  useMissions,
} from './gamification';

const requestMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('fetchGamificationStatus', () => {
  it('requests GET /v1/gamification/me', async () => {
    const response = { totalXp: 120, level: 2, currentStreak: 3, longestStreak: 5 };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchGamificationStatus();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/gamification/me');
  });
});

describe('useGamificationStatus', () => {
  it('resolves the real status through React Query', async () => {
    const response = { totalXp: 120, level: 2, currentStreak: 3, longestStreak: 5 };
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useGamificationStatus(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});

describe('fetchBadges', () => {
  it('requests GET /v1/gamification/badges', async () => {
    const response = [
      {
        badgeId: 'b-1',
        name: 'First Lesson',
        description: '',
        iconUrl: null,
        earnedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchBadges();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/gamification/badges');
  });
});

describe('useBadges', () => {
  it('resolves the real badge list through React Query', async () => {
    const response = [
      {
        badgeId: 'b-1',
        name: 'First Lesson',
        description: '',
        iconUrl: null,
        earnedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useBadges(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});

describe('fetchMissions', () => {
  it('requests GET /v1/gamification/missions', async () => {
    const response = [
      {
        missionId: 'm-1',
        type: 'DAILY' as const,
        metric: 'XP_EARNED' as const,
        targetValue: 50,
        progress: 20,
        rewardXp: 10,
        completedAt: null,
        endsAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchMissions();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/gamification/missions');
  });
});

describe('useMissions', () => {
  it('resolves the real mission list through React Query', async () => {
    const response = [
      {
        missionId: 'm-1',
        type: 'DAILY' as const,
        metric: 'XP_EARNED' as const,
        targetValue: 50,
        progress: 20,
        rewardXp: 10,
        completedAt: null,
        endsAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useMissions(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});
