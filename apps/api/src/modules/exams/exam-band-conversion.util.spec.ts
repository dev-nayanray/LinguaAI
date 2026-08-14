import { examBandFromCorrectCount } from './exam-band-conversion.util.js';

describe('examBandFromCorrectCount', () => {
  it('returns 0 when there are no questions at all', () => {
    expect(examBandFromCorrectCount(0, 0)).toBe(0);
  });

  it('returns the top band for a perfect score', () => {
    expect(examBandFromCorrectCount(2, 2)).toBe(9);
  });

  it('returns a low band for a mostly-wrong score', () => {
    expect(examBandFromCorrectCount(0, 2)).toBe(2.5);
  });

  it('returns a real, monotonically non-decreasing band as correctness increases', () => {
    const bands = [0, 1, 2, 3, 4].map((correct) => examBandFromCorrectCount(correct, 4));
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]!).toBeGreaterThanOrEqual(bands[i - 1]!);
    }
  });

  it('always returns a real multiple of 0.5', () => {
    for (let correct = 0; correct <= 10; correct++) {
      const band = examBandFromCorrectCount(correct, 10);
      expect(band * 2).toBe(Math.round(band * 2));
    }
  });
});
