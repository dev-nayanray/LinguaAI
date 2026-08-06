import { cn } from '@ui/lib/cn';

import { useReducedMotion } from '../../hooks/use-reduced-motion';

export type VoiceSessionState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceSessionIndicatorProps {
  state: VoiceSessionState;
  /** Pre-parsed error message (§6 — no `packages/validation` dependency). Only meaningful when `state === 'error'`. */
  errorMessage?: string;
  className?: string;
}

const STATE_LABEL: Record<Exclude<VoiceSessionState, 'error'>, string> = {
  idle: 'Idle',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
};

// `accent` is documented in tokens.css as reserved for "real-time
// communication contexts" — the exact fit for the AI's live voice output.
const STATE_DOT_CLASS: Record<Exclude<VoiceSessionState, 'error'>, string> = {
  idle: 'bg-disabled-bg',
  listening: 'bg-ai-text',
  processing: 'bg-primary-text',
  speaking: 'bg-accent-text',
};

/**
 * E3 §12.4's voice-session state machine (presentational). This component
 * renders whatever `state` it's given — the caller owns the transitions
 * (idle→listening→processing→speaking→idle, speaking→listening for
 * barge-in, `*`→error, error→idle); it makes no inference about *why* a
 * transition happened, no network access (ADR-006, §13). `error` is a
 * first-class state, not a separate boolean flag, with its own
 * `aria-live="assertive"` announcement — the other four states announce
 * `aria-live="polite"`.
 */
export function VoiceSessionIndicator({
  state,
  errorMessage,
  className,
}: VoiceSessionIndicatorProps) {
  const reducedMotion = useReducedMotion();

  if (state === 'error') {
    return (
      <div
        role="alert"
        className={cn('flex items-center gap-2 type-body-sm text-danger-text', className)}
      >
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-danger-solid" />
        {errorMessage ?? 'Something went wrong with the voice session.'}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 type-body-sm text-neutral-text', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'h-2.5 w-2.5 rounded-full',
          STATE_DOT_CLASS[state],
          state !== 'idle' && !reducedMotion && 'animate-pulse',
        )}
      />
      <span aria-live="polite">{STATE_LABEL[state]}</span>
    </div>
  );
}
