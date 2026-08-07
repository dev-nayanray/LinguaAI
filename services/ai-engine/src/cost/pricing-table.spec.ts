import { estimateCostUsdMicros } from './pricing-table.js';

describe('estimateCostUsdMicros', () => {
  it('matches a known model family by substring, ignoring a version/date suffix', () => {
    const withSuffix = estimateCostUsdMicros('claude-sonnet-4-5-20250929', 1_000_000, 0);
    const bare = estimateCostUsdMicros('claude-sonnet', 1_000_000, 0);

    expect(withSuffix).toBe(3_000_000); // $3 per million input tokens, expressed in micros
    expect(withSuffix).toBe(bare);
  });

  it('matches case-insensitively', () => {
    expect(estimateCostUsdMicros('CLAUDE-HAIKU-4-5', 1_000_000, 0)).toBe(
      estimateCostUsdMicros('claude-haiku-4-5', 1_000_000, 0),
    );
  });

  it('prices input and output tokens independently at their own per-million rate', () => {
    const cost = estimateCostUsdMicros('claude-opus', 1_000_000, 1_000_000);

    // $15/M input + $75/M output = $90 = 90,000,000 micros
    expect(cost).toBe(90_000_000);
  });

  it('falls back to conservative non-zero pricing for an unrecognized model rather than recording $0', () => {
    const cost = estimateCostUsdMicros('some-brand-new-unreleased-model', 1_000_000, 1_000_000);

    // fallback: $5/M input + $15/M output = $20 = 20,000,000 micros
    expect(cost).toBe(20_000_000);
    expect(cost).toBeGreaterThan(0);
  });

  it('rounds to the nearest whole micro-dollar since AIUsageLog.costUsdMicros is an integer column', () => {
    const cost = estimateCostUsdMicros('gpt-4o-mini', 3, 7);

    expect(Number.isInteger(cost)).toBe(true);
  });

  it('returns 0 for a zero-token request', () => {
    expect(estimateCostUsdMicros('claude-sonnet', 0, 0)).toBe(0);
  });

  it('prices an embedding model with zero output cost', () => {
    const cost = estimateCostUsdMicros('text-embedding-3-small', 1_000_000, 0);

    expect(cost).toBe(20_000); // $0.02 per million input tokens
  });
});
