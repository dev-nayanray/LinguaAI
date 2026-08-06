import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MissionCard } from './mission-card';

describe('MissionCard', () => {
  it('renders the title, description, and progress', () => {
    render(
      <MissionCard
        title="Complete 5 lessons"
        description="Finish any 5 lessons this week"
        current={3}
        target={5}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Complete 5 lessons' })).toBeInTheDocument();
    expect(screen.getByText('Finish any 5 lessons this week')).toBeInTheDocument();
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(progress).toHaveAttribute('aria-valuemax', '5');
  });

  it('renders the reward when provided', () => {
    render(<MissionCard title="Complete 5 lessons" current={1} target={5} reward="+50 XP" />);
    expect(screen.getByText('Reward: +50 XP')).toBeInTheDocument();
  });

  it('shows "Completed" once current reaches target', () => {
    render(<MissionCard title="Complete 5 lessons" current={5} target={5} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('does not show "Completed" while still in progress', () => {
    render(<MissionCard title="Complete 5 lessons" current={2} target={5} />);
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });
});
