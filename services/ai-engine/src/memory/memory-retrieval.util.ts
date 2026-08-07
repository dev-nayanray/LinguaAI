/**
 * All provisional — no production retrieval data exists yet to derive
 * these from, same honesty precedent as ADR-034's cost-breaker thresholds
 * and the Orchestrator's own rolling-summary constants (T4).
 */
export const MEMORY_CONFIDENCE_HALF_LIFE_DAYS = 90;
export const MEMORY_CONFIDENCE_FLOOR = 0.1;
export const MEMORY_RETRIEVAL_CANDIDATE_POOL_SIZE = 20;
export const MEMORY_RETRIEVAL_TOKEN_BUDGET = 500;

/** pgvector's own text input format for a `vector` column — `[v1,v2,...]`, cast with `::vector` at the SQL call site. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * A lightweight, no-tokenizer-dependency approximation (~4 characters per
 * token, a commonly-cited English-text average) — bounding a prompt-context
 * budget only needs to be roughly right, not exact; a real tokenizer
 * dependency isn't justified for this.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * AI_SYSTEM.md §5: "an unreinforced note decays in retrieval weight over
 * time... preventing stale personalization." Exponential decay by
 * half-life — a note not reinforced for `MEMORY_CONFIDENCE_HALF_LIFE_DAYS`
 * retains half its original confidence, a quarter after two half-lives,
 * and so on; `lastReinforcedAt` moving forward (a future task's job,
 * not built here) resets the clock.
 */
export function decayedConfidence(confidence: number, lastReinforcedAt: Date, now: Date): number {
  const daysSinceReinforced = (now.getTime() - lastReinforcedAt.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, daysSinceReinforced / MEMORY_CONFIDENCE_HALF_LIFE_DAYS);
  return confidence * decayFactor;
}
