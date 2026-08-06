import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '@ui/components/button';
import { cn } from '@ui/lib/cn';

/**
 * Not a feature test — a resolver check. E3 T3 (§6b) wires `@ui/*` across
 * four independent resolvers (tsc, this app's own Vitest config, Next's
 * Turbopack/webpack, packages/ui's own Vitest config); this file is the
 * only thing in apps/admin that actually imports through the alias, so
 * it's what proves this app's Vitest resolver entry isn't dead configuration.
 */
describe('@ui/* alias (apps/admin Vitest resolver)', () => {
  it('resolves a deep-imported packages/ui component and renders it', () => {
    render(<Button>Continue</Button>);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('resolves a deep-imported packages/ui lib module', () => {
    const showB = false;
    expect(cn('a', showB && 'b', 'c')).toBe('a c');
  });
});
