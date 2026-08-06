import * as React from 'react';

import { Bot } from '@ui/icons';
import { cn } from '@ui/lib/cn';

import { Button } from '../button';

export interface MessageBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  role: 'user' | 'ai';
  children?: React.ReactNode;
  /** Mid-stream failure/recovery (E3 §12.5) — renders in place of `children`, with a retry affordance if the caller can retry. */
  error?: { message: string; onRetry?: () => void };
}

/**
 * E3 §12.2/§12.5 message bubble. AI-purple is **never** the sole signal
 * that a message is AI-originated (DESIGN_SYSTEM.md §2, WCAG 1.4.1) — the
 * `Bot` icon is the persistent, non-color marker; the purple border/icon
 * color is reinforcement, not the mechanism.
 */
export function MessageBubble({ role, children, error, className, ...props }: MessageBubbleProps) {
  const isAi = role === 'ai';

  return (
    <div
      className={cn(
        'flex items-end gap-2',
        isAi ? 'justify-start' : 'flex-row-reverse justify-end',
        className,
      )}
      {...props}
    >
      {isAi && (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ai-text text-ai-text"
        >
          <Bot className="h-4 w-4" />
        </span>
      )}
      {error ? (
        <div
          role="alert"
          className="flex max-w-[75%] flex-col gap-2 rounded-lg border border-danger-text bg-surface px-4 py-3 type-body-sm text-danger-text"
        >
          <p>{error.message}</p>
          {error.onRetry && (
            <Button variant="secondary" size="default" onClick={error.onRetry} className="w-fit">
              Retry
            </Button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'max-w-[75%] rounded-lg px-4 py-3 type-body-sm',
            isAi ? 'border border-ai-text bg-surface text-text' : 'bg-surface-muted text-text',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
