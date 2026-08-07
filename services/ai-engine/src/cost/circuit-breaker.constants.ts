/**
 * ADR-034: "Initial thresholds are a conservative placeholder... pending
 * real staging traffic data per AI_GOVERNANCE.md §5's own stated review
 * cadence" — not a guess presented as final. $50/minute, $500/hour are
 * round, deliberately conservative starting points with no production
 * traffic data behind them yet, same honesty precedent as every other
 * un-derived numeric parameter this epic has introduced.
 */
export const DEGRADE_THRESHOLD_PER_MINUTE_USD_MICROS = 50_000_000; // $50
export const HARD_STOP_THRESHOLD_PER_MINUTE_USD_MICROS = 100_000_000; // $100
export const DEGRADE_THRESHOLD_PER_HOUR_USD_MICROS = 500_000_000; // $500
export const HARD_STOP_THRESHOLD_PER_HOUR_USD_MICROS = 1_000_000_000; // $1,000

export type BreachState = 'NONE' | 'DEGRADE' | 'HARD_STOP';

/**
 * Fixed-window buckets (a key per calendar minute/hour, TTL'd slightly
 * past the window), not a continuously-recomputed rolling log — the
 * simple, real implementation of ADR-034's "sliding-window counter" this
 * task ships; thresholds are provisional regardless, so the extra
 * precision a true sorted-set-based sliding window would buy isn't
 * warranted yet.
 */
export function minuteBucketKey(date: Date): string {
  return `ai-cost:minute:${date.toISOString().slice(0, 16)}`;
}

export function hourBucketKey(date: Date): string {
  return `ai-cost:hour:${date.toISOString().slice(0, 13)}`;
}

export const MINUTE_BUCKET_TTL_SECONDS = 120;
export const HOUR_BUCKET_TTL_SECONDS = 7200;
