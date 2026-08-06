import { cn } from '@ui/lib/cn';

export interface InlineCorrectionPart {
  text: string;
  type: 'original' | 'correction';
}

export interface InlineCorrectionProps {
  /** Structured, never raw HTML (E3 §12.5) — a fixed, closed vocabulary the caller can't smuggle markup through. */
  parts: InlineCorrectionPart[];
  className?: string;
}

/**
 * E3 §12.4 inline correction/diff UI (strikethrough + replacement).
 * `<del>`/`<ins>` are real semantic HTML for exactly this — deletion and
 * insertion — not just `<span>`s with styling; both carry an implicit
 * ARIA role in modern browsers, so the correction is structurally
 * meaningful, not only visual. Renders as an inline `<span>`, not a block
 * — "inline correction" means embeddable inside a sentence the caller
 * composes (e.g. `<p>I <InlineCorrection parts={...} /> to the store.</p>`),
 * not a standalone paragraph of its own.
 */
export function InlineCorrection({ parts, className }: InlineCorrectionProps) {
  return (
    <span className={cn('type-body-md text-text', className)}>
      {parts.map((part, index) =>
        part.type === 'original' ? (
          <del key={index} className="text-danger-text decoration-2">
            {part.text}
          </del>
        ) : (
          <ins key={index} className="font-medium text-success-text no-underline">
            {part.text}
          </ins>
        ),
      )}
    </span>
  );
}
