/**
 * Provisional, approximate USD-per-million-token pricing, current as of
 * this task's own implementation — publisher pricing pages are the
 * source of truth and do change; this table is not wired to any
 * automatic sync. Matched by substring against the real, as-served
 * `modelId` (T1's own "always logged as-served, never assumed"
 * response field) rather than an exact string, since a real model id
 * commonly carries a date/version suffix (e.g. a snapshot tag) this
 * table should not need updating for on every such release.
 *
 * `costUsdMicros` on `AIUsageLog` is a real, structured field regardless
 * of this table's own precision — an approximate cost is what makes the
 * circuit breaker's spend-rate signal real and continuous rather than
 * absent entirely; ADR-034 itself already treats the *thresholds* this
 * feeds as provisional, and this table inherits the same honesty.
 */
interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMillionUsd: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillionUsd: number;
}

const PRICING_BY_MODEL_SUBSTRING: ReadonlyArray<readonly [string, ModelPricing]> = [
  ['claude-opus', { inputPerMillionUsd: 15, outputPerMillionUsd: 75 }],
  ['claude-sonnet', { inputPerMillionUsd: 3, outputPerMillionUsd: 15 }],
  ['claude-haiku', { inputPerMillionUsd: 0.8, outputPerMillionUsd: 4 }],
  ['gpt-4o-mini', { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 }],
  ['gpt-4o', { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 }],
  ['text-embedding-3-small', { inputPerMillionUsd: 0.02, outputPerMillionUsd: 0 }],
];

/** Applied when no substring above matches — a real, if conservative, non-zero estimate rather than silently recording $0 for an unrecognized model. */
const FALLBACK_PRICING: ModelPricing = { inputPerMillionUsd: 5, outputPerMillionUsd: 15 };

function pricingFor(modelId: string): ModelPricing {
  const lowerModelId = modelId.toLowerCase();
  const match = PRICING_BY_MODEL_SUBSTRING.find(([substring]) => lowerModelId.includes(substring));
  return match ? match[1] : FALLBACK_PRICING;
}

/** Rounded to the nearest whole micro-dollar — `AIUsageLog.costUsdMicros` is an integer column (DATABASE.md: "never a float for money"). */
export function estimateCostUsdMicros(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = pricingFor(modelId);
  const inputUsd = (inputTokens / 1_000_000) * pricing.inputPerMillionUsd;
  const outputUsd = (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return Math.round((inputUsd + outputUsd) * 1_000_000);
}
