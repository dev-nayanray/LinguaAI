import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientErrorBoundary } from './client-error-boundary';

function Bomb(): never {
  throw new Error('deliberate test error');
}

describe('ClientErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught errors to console.error itself — silenced to keep
    // test output clean (same pattern as packages/ui's own error-boundary
    // tests).
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ClientErrorBoundary>
        <p>all good</p>
      </ClientErrorBoundary>,
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('catches a thrown error and renders the fallback, using a real @linguaai/observability logger', () => {
    // Uses the real createLogger (not a mock) — this is what actually
    // proves createLogger is safe to import/instantiate in a client
    // bundle context, the specific risk this wiring needed to rule out
    // (see client-error-boundary.tsx's comment on why initObservability()
    // is NOT used here).
    render(
      <ClientErrorBoundary>
        <Bomb />
      </ClientErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
