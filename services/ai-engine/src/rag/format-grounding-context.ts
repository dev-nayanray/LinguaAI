import type { GroundingPassage } from './rag-retrieval.types.js';

export function citationFor(entryId: string): string {
  return `kb:${entryId}`;
}

/**
 * AI_SYSTEM.md §4's pipeline: "Retrieved grounding passages injected into
 * the prompt context, cited internally." A model instructed to reference
 * `[kb:<id>]` when a claim rests on a specific passage produces output a
 * later step can check against what was actually retrieved — the concrete
 * "citation format" T7's own evidence bar names. Returns '' for an empty
 * passage list so a caller can safely concatenate this onto a system
 * prompt unconditionally, the same pattern OrchestratorService's own
 * summary/memory suffixes already use (T4/T6).
 */
export function formatGroundingContextForPrompt(passages: GroundingPassage[]): string {
  if (passages.length === 0) {
    return '';
  }
  const lines = passages.map((p) => `[${p.citation}] ${p.title}: ${p.content}`).join('\n');
  return `\n\nGrounding context — cite the bracketed reference (e.g. "[${passages[0]!.citation}]") when a claim rests on one of these passages:\n${lines}`;
}
