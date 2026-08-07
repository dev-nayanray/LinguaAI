import { estimateCostUsdMicros } from '../../cost/pricing-table.js';
import { COST_LATENCY_BASELINE } from './cost-latency.baseline.js';

/**
 * AI_GOVERNANCE.md §3's "Cost/latency regression" suite — INTERIM version,
 * and honestly the narrowest-scoped of this directory's four suites.
 *
 * What this checks: `estimateCostUsdMicros()` (T9's pricing table) still
 * produces the checked-in baseline cost for a representative fixture set
 * of (model, input tokens, output tokens) tuples — a deterministic MATH
 * regression on the pricing/circuit-breaker logic itself. See
 * `cost-latency.baseline.ts`'s own header for how an intentional pricing
 * change is meant to update this baseline (the "documented-exception
 * override" AI_GOVERNANCE.md §3's table requires specifically for this
 * suite).
 *
 * What this does NOT check, honestly out of scope for this interim
 * version: real *latency* regression (no live model call is made
 * anywhere in this test suite, so there is no real latency signal to
 * regress against) or real production cost-trend drift (AI_GOVERNANCE.md
 * §3's own "scheduled [run] against production traffic samples" — no
 * production traffic exists yet). Both require live infrastructure this
 * interim version does not have access to.
 *
 * How a false negative would be caught: an accidental edit to
 * `pricing-table.ts` (a typo'd rate, a swapped input/output value, a
 * substring match now matching the wrong model family) changes a
 * computed cost without the baseline being touched, failing this suite
 * immediately and by exactly the wrong amount — a fast, precise signal
 * for what changed.
 *
 * Permanent, mature version: real latency regression against live model
 * calls, and real cost-trend drift detection against production
 * `AIUsageLog` data, are owned by whichever future epic first budgets for
 * both live AI evaluation infrastructure and a production traffic
 * baseline to compare against.
 */
describe('Cost/latency regression (AI_GOVERNANCE.md §3, interim)', () => {
  it.each(COST_LATENCY_BASELINE)(
    '$label',
    ({ modelId, inputTokens, outputTokens, expectedCostUsdMicros }) => {
      const cost = estimateCostUsdMicros(modelId, inputTokens, outputTokens);

      expect(cost).toBe(expectedCostUsdMicros);
    },
  );
});
