import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('exposes role="progressbar" with aria-valuenow/min/max and a text alternative', () => {
    render(<ProgressBar value={6} max={10} label="Lesson progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Lesson progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '6');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
  });

  it('defaults max to 100', () => {
    render(<ProgressBar value={50} label="Progress" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps a value above max down to max', () => {
    render(<ProgressBar value={150} max={100} label="Progress" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps a negative value up to 0', () => {
    render(<ProgressBar value={-10} max={100} label="Progress" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows the optional value/max caption only when requested', () => {
    const { rerender } = render(<ProgressBar value={6} max={10} label="Progress" />);
    expect(screen.queryByText('6 / 10')).not.toBeInTheDocument();

    rerender(<ProgressBar value={6} max={10} label="Progress" showValueText />);
    expect(screen.getByText('6 / 10')).toBeInTheDocument();
  });
});
