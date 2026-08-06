'use client';

import { toast } from 'sonner';

import { Star } from '@ui/icons';
import { cn } from '@ui/lib/cn';

import { useReducedMotion } from '../../hooks/use-reduced-motion';

export interface XpToastContentProps {
  xp: number;
  message?: string;
}

/**
 * E3 §12.2/§12.5 XP toast/celebration content, shown through the
 * `Toaster` from `../ui/toaster` (already mounted once per app). No
 * `role`/`aria-live` of its own — sonner's own toast list region already
 * supplies `aria-live="polite"` and never steals focus (§12.5); adding a
 * second live region here would risk double-announcing the same content.
 *
 * **Manual screen-reader verification outstanding.** This is one of the
 * eight components §12.5 names as requiring a human NVDA/VoiceOver pass
 * (Accessibility Quality Gate, §21) — that pass has not been performed. It
 * is built and automatedly tested to spec, same caveat as T8's
 * `BottomTabBar`.
 */
export function XpToastContent({ xp, message }: XpToastContentProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning-text bg-surface-elevated px-4 py-3 shadow-high">
      {/* sonner already animates the toast's own enter/exit; this is a
       * small extra celebratory touch on the icon only, using Tailwind's
       * real built-in `animate-pulse` keyframe (not the tailwindcss-animate
       * plugin's `animate-in` family, which isn't installed — see
       * lib/animation.ts's own doc comment for the same finding, T3). */}
      <Star
        aria-hidden="true"
        className={cn(
          'h-6 w-6 shrink-0 fill-warning-text text-warning-text',
          !reducedMotion && 'animate-pulse',
        )}
      />
      <div>
        <p className="type-body-sm font-semibold text-text">+{xp} XP</p>
        {message && <p className="type-caption text-neutral-text">{message}</p>}
      </div>
    </div>
  );
}

/**
 * Imperative trigger — the consuming app calls this from wherever XP is
 * actually earned (a lesson-complete handler, etc.); this package has no
 * opinion on when that is (presentational only, ADR-006).
 */
export function celebrateXp(options: XpToastContentProps) {
  return toast.custom(() => <XpToastContent {...options} />);
}
