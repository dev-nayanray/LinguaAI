import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { Button } from '../button';

export interface StreamingTokenRendererProps {
  /** The full accumulated text so far — the caller appends to this as tokens arrive; this component never fetches or streams on its own (presentational only, ADR-006). */
  content: string;
  /** Minimum interval between `aria-live` announcements (ms). Default 500 — frequent enough to feel live, sparse enough not to spam a screen reader on every token. */
  throttleMs?: number;
  /** Mid-stream failure/recovery (E3 §12.5) — replaces the rendered content. */
  error?: { message: string; onRetry?: () => void };
  className?: string;
}

interface ChunkData {
  id: number;
  text: string;
}

/**
 * `React.memo`'d so a chunk already on screen never re-renders when a
 * later chunk is appended — `data-render-count` (always present, not
 * environment-gated; it's an inert attribute, not a Node.js API access,
 * so E3 §13's `no-restricted-globals` ban doesn't apply) is what T10's
 * evidence requirement ("a render-count assertion in its interaction
 * test") reads to prove that hasn't happened.
 */
const Chunk = React.memo(function Chunk({ id, text }: ChunkData) {
  const renderCount = React.useRef(0);
  renderCount.current += 1;
  return (
    <span data-chunk-index={id} data-render-count={renderCount.current}>
      {text}
    </span>
  );
});
Chunk.displayName = 'StreamingTokenRenderer.Chunk';

/**
 * E3 §12.4/§12.5 streaming-token renderer. Append-only: growth in
 * `content` becomes one new `Chunk`, never a re-render of the chunks
 * already rendered (§15's "no full re-render per token" rule). The
 * visible text and the `aria-live` announcement are two separate DOM
 * regions on purpose — the visible one updates immediately (`aria-hidden`,
 * so it's never itself announced) and the live region announces the
 * latest content at most once per `throttleMs`, so a screen reader gets
 * one coherent update instead of a flood of per-token interruptions.
 */
export function StreamingTokenRenderer({
  content,
  throttleMs = 500,
  error,
  className,
}: StreamingTokenRendererProps) {
  const [chunks, setChunks] = React.useState<ChunkData[]>([]);
  const nextIdRef = React.useRef(0);

  React.useEffect(() => {
    setChunks((prev) => {
      const prevText = prev.map((c) => c.text).join('');
      if (content === prevText) return prev;
      if (content.startsWith(prevText)) {
        const suffix = content.slice(prevText.length);
        return suffix ? [...prev, { id: nextIdRef.current++, text: suffix }] : prev;
      }
      // `content` shrank or diverged from what's already rendered (a new
      // message started) — not an append, so start over.
      nextIdRef.current = 1;
      return content ? [{ id: 0, text: content }] : [];
    });
  }, [content]);

  const [announced, setAnnounced] = React.useState('');
  const lastAnnounceRef = React.useRef(0);

  React.useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastAnnounceRef.current;
    if (elapsed >= throttleMs) {
      lastAnnounceRef.current = now;
      setAnnounced(content);
      return;
    }
    const timeout = setTimeout(() => {
      lastAnnounceRef.current = Date.now();
      setAnnounced(content);
    }, throttleMs - elapsed);
    return () => clearTimeout(timeout);
  }, [content, throttleMs]);

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-danger-text bg-surface px-4 py-3 type-body-sm text-danger-text',
          className,
        )}
      >
        <p>{error.message}</p>
        {error.onRetry && (
          <Button variant="secondary" onClick={error.onRetry} className="w-fit">
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('type-body-md text-text', className)}>
      <span aria-hidden="true">
        {chunks.map((chunk) => (
          <Chunk key={chunk.id} id={chunk.id} text={chunk.text} />
        ))}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announced}
      </span>
    </div>
  );
}
