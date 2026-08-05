import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './error-boundary';

function createMockLogger() {
  return { error: vi.fn() } as unknown as import('@linguaai/observability').Logger;
}

/** Throws on mount unless `shouldThrow` is false — lets tests simulate recovery. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom');
  }
  return <div>safe content</div>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught errors to console.error itself regardless of
    // componentDidCatch — silenced here to keep test output clean.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    const logger = createMockLogger();
    render(
      <ErrorBoundary logger={logger}>
        <div>all good</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('renders the default fallback and reports the error via the logger when a child throws', () => {
    const logger = createMockLogger();
    render(
      <ErrorBoundary logger={logger}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [meta, message] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(meta.err).toBeInstanceOf(Error);
    expect((meta.err as Error).message).toBe('boom');
    expect(message).toBe('Unhandled error caught by ErrorBoundary');
  });

  it('never renders the raw error message or a stack trace in the fallback UI', () => {
    const logger = createMockLogger();
    render(
      <ErrorBoundary logger={logger}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('renders a custom fallback when one is provided', () => {
    const logger = createMockLogger();
    render(
      <ErrorBoundary logger={logger} fallback={({ error }) => <p>Custom: {error.message}</p>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom: boom')).toBeInTheDocument();
  });

  it('recovers and re-renders children after "Try again" is clicked and the failure is resolved', async () => {
    const logger = createMockLogger();
    const user = userEvent.setup();

    // A mutable flag read by ControlledBomb, flipped before triggering reset.
    let shouldThrow = true;
    function ControlledBomb() {
      return <Bomb shouldThrow={shouldThrow} />;
    }

    const { rerender } = render(
      <ErrorBoundary logger={logger}>
        <ControlledBomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    rerender(
      <ErrorBoundary logger={logger}>
        <ControlledBomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
