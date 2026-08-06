import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CircularProgress } from './circular-progress';

describe('CircularProgress', () => {
  it('exposes role="progressbar" with aria-valuenow/min/max and a text alternative', () => {
    render(<CircularProgress value={72} label="Spanish mastery" />);
    const bar = screen.getByRole('progressbar', { name: 'Spanish mastery' });
    expect(bar).toHaveAttribute('aria-valuenow', '72');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('supports a custom max', () => {
    render(<CircularProgress value={3} max={5} label="Skill level" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5');
  });

  it('clamps values outside the [0, max] range', () => {
    const { rerender } = render(<CircularProgress value={200} label="Progress" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(<CircularProgress value={-5} label="Progress" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders an SVG ring sized by the size prop', () => {
    const { container } = render(<CircularProgress value={50} label="Progress" size={64} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });
});
