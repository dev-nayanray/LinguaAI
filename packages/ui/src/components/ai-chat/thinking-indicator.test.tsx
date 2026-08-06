import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThinkingIndicator } from './thinking-indicator';

describe('ThinkingIndicator', () => {
  it('renders nothing for the "typing" phase — the streaming renderer owns the visible text', () => {
    const { container } = render(<ThinkingIndicator phase="typing" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for the "idle" phase', () => {
    const { container } = render(<ThinkingIndicator phase="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a live-region announcement exactly once for the "thinking" phase', () => {
    render(<ThinkingIndicator phase="thinking" />);
    const live = screen.getByText('AI is responding');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('is fully removed from the DOM (not merely hidden) when transitioning out of "thinking"', () => {
    const { rerender, container } = render(<ThinkingIndicator phase="thinking" />);
    expect(screen.getByText('AI is responding')).toBeInTheDocument();

    rerender(<ThinkingIndicator phase="typing" />);
    expect(screen.queryByText('AI is responding')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
