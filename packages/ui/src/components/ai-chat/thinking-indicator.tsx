import { cn } from '@ui/lib/cn';

import { useReducedMotion } from '../../hooks/use-reduced-motion';

export type ThinkingPhase = 'thinking' | 'typing' | 'idle';

export interface ThinkingIndicatorProps {
  /**
   * `typing` is this component rendering nothing — the streaming-token
   * renderer's own append-only text is the typing signal, per its
   * contract. `idle` also renders nothing.
   */
  phase: ThinkingPhase;
  className?: string;
}

/**
 * E3 §12.4's "thinking" vs. "typing" distinction. Not rendering anything
 * outside `thinking` — rather than hiding via CSS — is what satisfies both
 * "the live-region announcement fires exactly once per thinking entry"
 * (an unmounted-then-remounted region is genuinely new content to a
 * screen reader; identical static text that stays mounted is not
 * re-announced) and "removed from the DOM (not merely hidden) on
 * transition to typing".
 */
export function ThinkingIndicator({ phase, className }: ThinkingIndicatorProps) {
  const reducedMotion = useReducedMotion();

  if (phase !== 'thinking') {
    return null;
  }

  return (
    <div
      // Fixed height, dimensioned once — this *is* the loading state
      // (§12.4: "there is no further loading sub-state"), so it must not
      // grow/shift the layout when it appears (§15's CLS rule).
      className={cn('flex h-8 items-center gap-1.5', className)}
    >
      <span className="sr-only" aria-live="polite">
        AI is responding
      </span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn('h-2 w-2 rounded-full bg-ai-text', !reducedMotion && 'animate-pulse')}
          style={reducedMotion ? undefined : { animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
