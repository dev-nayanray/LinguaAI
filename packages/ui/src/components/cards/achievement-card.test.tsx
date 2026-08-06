import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AchievementCard } from './achievement-card';

describe('AchievementCard', () => {
  it('renders the title and description, unlocked by default', () => {
    render(<AchievementCard title="7-day streak" description="Practice 7 days in a row" />);
    expect(screen.getByRole('heading', { name: '7-day streak' })).toBeInTheDocument();
    expect(screen.getByText('Practice 7 days in a row')).toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
  });

  it('shows a "Locked" text badge (not color/opacity alone) when unlocked is false', () => {
    render(<AchievementCard title="30-day streak" unlocked={false} />);
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('renders an icon slot when provided', () => {
    render(<AchievementCard title="7-day streak" icon={<span data-testid="badge-icon">*</span>} />);
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument();
  });

  it('renders a loading skeleton instead of the title when loading', () => {
    render(<AchievementCard title="7-day streak" loading />);
    expect(screen.queryByRole('heading', { name: '7-day streak' })).not.toBeInTheDocument();
  });
});
