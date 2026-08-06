import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamingTokenRenderer } from './streaming-token-renderer';

describe('StreamingTokenRenderer', () => {
  it('renders the accumulated content', () => {
    const { container } = render(<StreamingTokenRenderer content="Hello" />);
    // Scoped to the visible (aria-hidden) region — the sr-only live region
    // mirrors the same text, so an unscoped query would match both.
    const visible = container.querySelector('[aria-hidden="true"]');
    expect(visible).toHaveTextContent('Hello');
  });

  // E3 T10's own named evidence requirement (§20, §15): "a render-count
  // assertion in its interaction test" proving append-only rendering —
  // "no full re-render per token".
  it('append-only: does not re-render an already-rendered chunk when new content is appended', () => {
    const { rerender, container } = render(<StreamingTokenRenderer content="Hello" />);
    const chunk0 = () => container.querySelector('[data-chunk-index="0"]');

    expect(chunk0()?.textContent).toBe('Hello');
    expect(chunk0()).toHaveAttribute('data-render-count', '1');

    rerender(<StreamingTokenRenderer content="Hello world" />);

    // The first chunk's own render function did not execute again —
    // React.memo bailed out because its props (id, text) didn't change.
    expect(chunk0()).toHaveAttribute('data-render-count', '1');
    // The new suffix became its own, separate chunk.
    const chunk1 = container.querySelector('[data-chunk-index="1"]');
    expect(chunk1?.textContent).toBe(' world');
    expect(chunk1).toHaveAttribute('data-render-count', '1');
  });

  it('append-only: a third token still leaves the first two chunks unrendered', () => {
    const { rerender, container } = render(<StreamingTokenRenderer content="A" />);
    rerender(<StreamingTokenRenderer content="AB" />);
    rerender(<StreamingTokenRenderer content="ABC" />);

    expect(container.querySelector('[data-chunk-index="0"]')).toHaveAttribute(
      'data-render-count',
      '1',
    );
    expect(container.querySelector('[data-chunk-index="1"]')).toHaveAttribute(
      'data-render-count',
      '1',
    );
    expect(container.querySelector('[data-chunk-index="2"]')).toHaveAttribute(
      'data-render-count',
      '1',
    );
  });

  it('starts over when content is reset (a new message), rather than treating it as an append', () => {
    const { rerender, container } = render(<StreamingTokenRenderer content="First message" />);
    rerender(<StreamingTokenRenderer content="" />);
    rerender(<StreamingTokenRenderer content="Second" />);

    const visible = () => container.querySelector('[aria-hidden="true"]');
    expect(visible()?.textContent).toBe('Second');
    expect(container.querySelectorAll('[data-chunk-index]')).toHaveLength(1);
  });

  it('renders the error state with role="alert" and a retry action, replacing the content', () => {
    render(<StreamingTokenRenderer content="partial" error={{ message: 'Connection lost' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.queryByText('partial')).not.toBeInTheDocument();
  });

  describe('throttled aria-live announcement', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('announces immediately on first content, then throttles subsequent updates', () => {
      const { rerender, container } = render(
        <StreamingTokenRenderer content="A" throttleMs={500} />,
      );
      const liveRegion = () => container.querySelector('[aria-live="polite"]');
      expect(liveRegion()).toHaveTextContent('A');

      rerender(<StreamingTokenRenderer content="AB" throttleMs={500} />);
      // Too soon — the throttled region hasn't caught up yet.
      expect(liveRegion()).toHaveTextContent('A');

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(liveRegion()).toHaveTextContent('AB');
    });
  });
});
