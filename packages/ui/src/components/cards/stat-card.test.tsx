import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="XP this week" value={1250} />);
    expect(screen.getByText('XP this week')).toBeInTheDocument();
    expect(screen.getByText('1250')).toBeInTheDocument();
  });

  it('renders a trend indicator when provided', () => {
    render(
      <StatCard
        label="Streak"
        value="14 days"
        trend={{ direction: 'up', label: '+3 vs last week' }}
      />,
    );
    expect(screen.getByText('+3 vs last week')).toBeInTheDocument();
  });

  it('omits the trend row entirely when no trend is given', () => {
    render(<StatCard label="Streak" value="14 days" />);
    expect(screen.queryByText(/vs last week/)).not.toBeInTheDocument();
  });

  it('renders an icon slot when provided', () => {
    render(<StatCard label="Lessons" value={42} icon={<span data-testid="icon">*</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders a loading skeleton instead of the label/value when loading', () => {
    render(<StatCard label="XP this week" value={1250} loading />);
    expect(screen.queryByText('XP this week')).not.toBeInTheDocument();
    expect(screen.queryByText('1250')).not.toBeInTheDocument();
  });
});
