const HTML_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g;

/**
 * SECURITY.md §5 / AI_GOVERNANCE.md §6: "AI-generated text rendered as
 * rich content is sanitized before rendering... protects against the
 * model being tricked into emitting unsafe markup." AI_SYSTEM.md §10
 * frames the Safety Layer as sitting "in the gateway... a mandatory pass
 * for all input/output, not an optional per-agent integration" — so this
 * strips any HTML tag surface at the source, in `services/ai-engine`
 * itself, before a response ever reaches a client. This is a real,
 * defense-in-depth layer, deliberately not a replacement for a renderer-
 * level sanitizer (e.g. DOMPurify at render time in `apps/web`/
 * `apps/mobile`) — that remains the primary defense SECURITY.md §5's own
 * "sanitized before rendering" wording describes; this is an earlier,
 * additional one. Model output is expected to be plain text/markdown —
 * there is no legitimate reason for it to ever contain a raw HTML tag, so
 * stripping every tag outright (rather than allow-listing a "safe" subset)
 * is the correct, simple default here.
 */
export function sanitizeOutput(text: string): string {
  return text.replace(HTML_TAG_PATTERN, '');
}
