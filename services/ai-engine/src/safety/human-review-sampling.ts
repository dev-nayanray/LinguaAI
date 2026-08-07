/**
 * AI_GOVERNANCE.md §6: "a defined percentage of agent outputs are sampled
 * for human quality/safety review, weighted higher in the weeks
 * immediately after any production rollout and for any newly launched
 * agent or language." Provisional — no production data exists yet to
 * derive a real rate from, same honesty precedent as every other
 * un-derived numeric parameter this epic has introduced (ADR-034's cost
 * thresholds, T4's rolling-summary trigger, T6/T7's retrieval budgets).
 * The "weighted higher after rollout / for a new agent or language" rule
 * is a real, stated requirement this constant does not implement — no
 * rollout-recency or per-language/per-agent signal exists anywhere in
 * this service to weight against yet; flagged, not silently assumed
 * covered by a single flat rate.
 */
export const HUMAN_REVIEW_SAMPLE_RATE = 0.02;

/** Accepts an injectable `random` source (defaults to Math.random) so this decision is deterministically testable, not just probabilistically. */
export function shouldSampleForReview(
  rate: number = HUMAN_REVIEW_SAMPLE_RATE,
  random: () => number = Math.random,
): boolean {
  return random() < rate;
}
