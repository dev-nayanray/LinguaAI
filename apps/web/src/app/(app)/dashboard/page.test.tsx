import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from './page';

const useTodayDailyGoalMock = vi.fn();

vi.mock('@/lib/api/daily-goals', () => ({
  useTodayDailyGoal: () => useTodayDailyGoalMock(),
}));

const publicUser = {
  id: 'u-1',
  email: 'user@test.local',
  displayName: 'Test User',
  avatarUrl: null,
  locale: 'en-US',
  timezone: 'UTC',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
  mfaEnrolled: false,
  organizationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DashboardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
  });

  it('greets the signed-in user by name and renders their real daily-goal targets', () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    useTodayDailyGoalMock.mockReturnValue({
      data: {
        id: 'goal-1',
        userId: 'u-1',
        learningPlanId: null,
        date: '2026-08-14',
        targetXp: 50,
        targetMinutes: 15,
        targetActivities: 3,
        completed: false,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardPage />);

    expect(screen.getByText('Welcome back, Test User')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an honest empty state when no daily goal has been generated yet', () => {
    useTodayDailyGoalMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardPage />);

    expect(screen.getByText(/Today's goal hasn't been generated yet/)).toBeInTheDocument();
  });

  it('shows a real error state with a working retry action', async () => {
    const refetch = vi.fn();
    useTodayDailyGoalMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();

    render(<DashboardPage />);

    expect(screen.getByText("Could not load today's goal.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('celebrates a completed daily goal', () => {
    useTodayDailyGoalMock.mockReturnValue({
      data: {
        id: 'goal-1',
        userId: 'u-1',
        learningPlanId: null,
        date: '2026-08-14',
        targetXp: 50,
        targetMinutes: 15,
        targetActivities: 3,
        completed: true,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardPage />);

    expect(screen.getByText('Completed for today — nice work!')).toBeInTheDocument();
  });
});
