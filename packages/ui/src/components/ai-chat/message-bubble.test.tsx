import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MessageBubble } from './message-bubble';

describe('MessageBubble', () => {
  it('renders user content without a persistent icon', () => {
    render(<MessageBubble role="user">Hello there</MessageBubble>);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders AI content with a persistent icon — not color alone (WCAG 1.4.1)', () => {
    render(<MessageBubble role="ai">Hi! How can I help?</MessageBubble>);
    expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument();
    // The AI marker is a real, always-present icon element, not merely a
    // background-color class the child text happens to sit inside.
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the error state with role="alert" and a retry action, in place of children', () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble role="ai" error={{ message: 'Failed to respond', onRetry }}>
        This should not render
      </MessageBubble>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to respond');
    expect(screen.queryByText('This should not render')).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<MessageBubble role="ai" error={{ message: 'Failed', onRetry }} />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when onRetry is not provided', () => {
    render(<MessageBubble role="ai" error={{ message: 'Failed' }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
