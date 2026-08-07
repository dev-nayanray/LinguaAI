import { estimateTokens, toVectorLiteral } from './vector-search.util.js';

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
