import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CefrBadge } from './cefr-badge';

describe('CefrBadge', () => {
  it('renders the level code, visible', () => {
    render(<CefrBadge level="B1" />);
    expect(screen.getByText('B1')).toBeInTheDocument();
  });

  it('provides a spelled-out text alternative for the level code', () => {
    render(<CefrBadge level="B1" />);
    expect(screen.getByText(/Intermediate/)).toBeInTheDocument();
  });

  it.each([
    ['A1', 'Beginner'],
    ['A2', 'Elementary'],
    ['B2', 'Upper intermediate'],
    ['C1', 'Advanced'],
    ['C2', 'Proficient'],
  ] as const)('maps %s to the label "%s"', (level, label) => {
    render(<CefrBadge level={level} />);
    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
  });
});
