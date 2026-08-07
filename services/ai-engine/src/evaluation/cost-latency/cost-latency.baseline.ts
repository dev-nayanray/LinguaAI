/**
 * AI_GOVERNANCE.md §3's "Cost/latency regression" suite — checked-in
 * baseline. A representative fixture set of (modelId, inputTokens,
 * outputTokens) tuples — one per `pricing-table.ts` entry, plus the
 * unrecognized-model fallback — with the `expectedCostUsdMicros` each one
 * produces today, computed via the real `estimateCostUsdMicros()` and
 * independently verified by hand before being checked in.
 *
 * **This file IS the "documented-exception override" mechanism**
 * AI_GOVERNANCE.md §3's table requires for this suite specifically ("Yes,
 * with documented-exception override," unlike the other three suites'
 * unconditional "Yes"): an intentional pricing-table change (a real
 * provider price update, a new model added) updates the numbers below in
 * the *same* PR, as a visible, reviewable diff — the override is "I
 * changed the baseline on purpose, here's the diff," not a special flag
 * or a separate approval flow. An *unintentional* drift (a typo in
 * `pricing-table.ts`, an accidentally-swapped model's rates) fails this
 * suite without any baseline change, exactly as a regression check should.
 */
export interface CostLatencyBaselineCase {
  label: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  expectedCostUsdMicros: number;
}

export const COST_LATENCY_BASELINE: readonly CostLatencyBaselineCase[] = [
  {
    label: 'claude-opus — a representative teacher-class turn',
    modelId: 'claude-opus-4-5',
    inputTokens: 2000,
    outputTokens: 500,
    expectedCostUsdMicros: 67_500,
  },
  {
    label: 'claude-sonnet — a representative teacher-class turn',
    modelId: 'claude-sonnet-5',
    inputTokens: 2000,
    outputTokens: 500,
    expectedCostUsdMicros: 13_500,
  },
  {
    label: 'claude-haiku — a representative economy-tier turn (ADR-034)',
    modelId: 'claude-haiku-4-5',
    inputTokens: 2000,
    outputTokens: 500,
    expectedCostUsdMicros: 3_600,
  },
  {
    label: 'gpt-4o-mini — a representative economy-tier turn (ADR-034)',
    modelId: 'gpt-4o-mini',
    inputTokens: 2000,
    outputTokens: 500,
    expectedCostUsdMicros: 600,
  },
  {
    label: 'gpt-4o — a representative teacher-class turn',
    modelId: 'gpt-4o',
    inputTokens: 2000,
    outputTokens: 500,
    expectedCostUsdMicros: 10_000,
  },
  {
    label: 'text-embedding-3-small — a representative memory/RAG embed call (ADR-031)',
    modelId: 'text-embedding-3-small',
    inputTokens: 500,
    outputTokens: 0,
    expectedCostUsdMicros: 10,
  },
  {
    label: 'unrecognized model — falls back to the conservative non-zero default',
    modelId: 'some-future-model-v2',
    inputTokens: 2000,
    outputTokens: 500,
    expectedCostUsdMicros: 17_500,
  },
];
