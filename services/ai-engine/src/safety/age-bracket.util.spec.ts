import { resolveAgeBracket } from './age-bracket.util.js';

describe('resolveAgeBracket', () => {
  it('resolves a confirmed ADULT bracket to ADULT', () => {
    expect(resolveAgeBracket('ADULT')).toBe('ADULT');
  });

  it('fails closed to MINOR for an explicit MINOR bracket', () => {
    expect(resolveAgeBracket('MINOR')).toBe('MINOR');
  });

  it('fails closed to MINOR for UNKNOWN', () => {
    expect(resolveAgeBracket('UNKNOWN')).toBe('MINOR');
  });

  it('fails closed to MINOR for null', () => {
    expect(resolveAgeBracket(null)).toBe('MINOR');
  });

  it('fails closed to MINOR for undefined', () => {
    expect(resolveAgeBracket(undefined)).toBe('MINOR');
  });
});
