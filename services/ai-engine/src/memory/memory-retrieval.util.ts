/**
 * Memory-specific retrieval parameters — provisional, no production
 * retrieval data exists yet to derive these from, same honesty precedent
 * as ADR-034's cost-breaker thresholds and the Orchestrator's own
 * rolling-summary constants (T4). Generic pgvector/token helpers
 * (`toVectorLiteral`, `estimateTokens`) live in `../shared/vector-search.util.js`
 * — shared with T7's RagRetrievalService, not duplicated here.
 */
export const MEMORY_CONFIDENCE_HALF_LIFE_DAYS = 90;
export const MEMORY_CONFIDENCE_FLOOR = 0.1;
export const MEMORY_RETRIEVAL_CANDIDATE_POOL_SIZE = 20;
export const MEMORY_RETRIEVAL_TOKEN_BUDGET = 500;

/**
 * AI_SYSTEM.md §5: "an unreinforced note decays in retrieval weight over
 * time... preventing stale personalization." Exponential decay by
 * half-life — a note not reinforced for `MEMORY_CONFIDENCE_HALF_LIFE_DAYS`
 * retains half its original confidence, a quarter after two half-lives,
 * and so on; `lastReinforcedAt` moving forward (a future task's job,
 * not built here) resets the clock.
 *
 * `KnowledgeBaseEntry` (T7) has no equivalent — curated content is
 * governed by `isActive`/linguist sign-off, not automatic decay, so this
 * function is deliberately Memory-only, not promoted to the shared util.
 */
export function decayedConfidence(confidence: number, lastReinforcedAt: Date, now: Date): number {
  const daysSinceReinforced = (now.getTime() - lastReinforcedAt.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, daysSinceReinforced / MEMORY_CONFIDENCE_HALF_LIFE_DAYS);
  return confidence * decayFactor;
}
