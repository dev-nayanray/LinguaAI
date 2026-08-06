import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { XpBar } from './xp-bar';

describe('XpBar', () => {
  it('renders as a progressbar labeled and captioned with the XP values', () => {
    render(<XpBar current={1250} max={2000} />);
    const bar = screen.getByRole('progressbar', { name: '1250 of 2000 XP' });
    expect(bar).toHaveAttribute('aria-valuenow', '1250');
    expect(bar).toHaveAttribute('aria-valuemax', '2000');
    expect(screen.getByText('1250 / 2000')).toBeInTheDocument();
  });
});
