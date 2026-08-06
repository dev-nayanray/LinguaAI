import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StreakFlame } from './streak-flame';

describe('StreakFlame', () => {
  it('renders the day count, visible', () => {
    render(<StreakFlame days={14} />);
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('provides a full text alternative distinguishing plural/singular days', () => {
    const { rerender } = render(<StreakFlame days={1} />);
    expect(screen.getByText('day streak', { exact: false })).toBeInTheDocument();

    rerender(<StreakFlame days={2} />);
    expect(screen.getByText('days streak', { exact: false })).toBeInTheDocument();
  });

  it('marks an inactive (at-risk) streak in its text alternative, not color alone', () => {
    render(<StreakFlame days={5} active={false} />);
    expect(screen.getByText(/at risk/)).toBeInTheDocument();
  });

  it('does not mention "at risk" for an active streak', () => {
    render(<StreakFlame days={5} active />);
    expect(screen.queryByText(/at risk/)).not.toBeInTheDocument();
  });
});
