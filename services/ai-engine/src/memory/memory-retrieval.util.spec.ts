import {
  MEMORY_CONFIDENCE_HALF_LIFE_DAYS,
  decayedConfidence,
  estimateTokens,
  toVectorLiteral,
} from './memory-retrieval.util.js';

describe('toVectorLiteral', () => {
  it('formats a numeric array as a pgvector text literal', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  it('formats an empty array', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });
});

describe('estimateTokens', () => {
  it('approximates roughly 4 characters per token', () => {
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });

  it('rounds up for a partial token', () => {
    expect(estimateTokens('abc')).toBe(1);
  });

  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('decayedConfidence', () => {
  it('returns the full confidence when just reinforced', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(decayedConfidence(1.0, now, now)).toBeCloseTo(1.0);
  });

  it('halves at exactly one half-life', () => {
    const lastReinforcedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date(
      lastReinforcedAt.getTime() + MEMORY_CONFIDENCE_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000,
    );

    expect(decayedConfidence(1.0, lastReinforcedAt, now)).toBeCloseTo(0.5, 5);
  });

  it('quarters at two half-lives', () => {
    const lastReinforcedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date(
      lastReinforcedAt.getTime() + 2 * MEMORY_CONFIDENCE_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000,
    );

    expect(decayedConfidence(1.0, lastReinforcedAt, now)).toBeCloseTo(0.25, 5);
  });

  it('scales proportionally to the starting confidence', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(decayedConfidence(0.4, now, now)).toBeCloseTo(0.4);
  });
});
