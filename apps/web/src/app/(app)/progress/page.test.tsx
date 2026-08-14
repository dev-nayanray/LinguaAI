import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProgressPage from './page';

const useGamificationStatusMock = vi.fn();
const useBadgesMock = vi.fn();
const useMissionsMock = vi.fn();

vi.mock('@/lib/api/gamification', () => ({
  useGamificationStatus: () => useGamificationStatusMock(),
  useBadges: () => useBadgesMock(),
  useMissions: () => useMissionsMock(),
}));

function setupDefaults() {
  useGamificationStatusMock.mockReturnValue({
    data: { totalXp: 120, level: 2, currentStreak: 3, longestStreak: 5 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useBadgesMock.mockReturnValue({
    data: [
      {
        badgeId: 'b-1',
        name: 'First Lesson',
        description: 'Complete your first lesson',
        iconUrl: null,
        earnedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
  });
  useMissionsMock.mockReturnValue({
    data: [
      {
        missionId: 'm-1',
        type: 'DAILY',
        metric: 'XP_EARNED',
        targetValue: 50,
        progress: 20,
        rewardXp: 10,
        completedAt: null,
        endsAt: '2026-01-02T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
  });
}

describe('ProgressPage', () => {
  it('renders real status, mission, and badge data once loaded', () => {
    setupDefaults();

    render(<ProgressPage />);

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3 days')).toBeInTheDocument();
    expect(screen.getByText('XP_EARNED')).toBeInTheDocument();
    expect(screen.getByText('Reward: +10 XP')).toBeInTheDocument();
    expect(screen.getByText('First Lesson')).toBeInTheDocument();
  });

  it('shows honest empty states when nothing has been earned yet', () => {
    setupDefaults();
    useBadgesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    useMissionsMock.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<ProgressPage />);

    expect(screen.getByText('No active missions right now.')).toBeInTheDocument();
    expect(screen.getByText(/haven't earned any badges yet/)).toBeInTheDocument();
  });

  it('shows a real error state with a working retry action', () => {
    setupDefaults();
    const refetch = vi.fn();
    useGamificationStatusMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<ProgressPage />);

    expect(screen.getByText('Could not load your gamification status.')).toBeInTheDocument();
  });
});
