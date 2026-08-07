import { HUMAN_REVIEW_SAMPLE_RATE, shouldSampleForReview } from './human-review-sampling.js';

describe('shouldSampleForReview', () => {
  it('samples when the random draw falls below the rate', () => {
    expect(shouldSampleForReview(0.5, () => 0.1)).toBe(true);
  });

  it('does not sample when the random draw falls at or above the rate', () => {
    expect(shouldSampleForReview(0.5, () => 0.5)).toBe(false);
    expect(shouldSampleForReview(0.5, () => 0.9)).toBe(false);
  });

  it('never samples at rate 0', () => {
    expect(shouldSampleForReview(0, () => 0)).toBe(false);
  });

  it('always samples at rate 1 (short of drawing exactly 1.0, which Math.random() never returns)', () => {
    expect(shouldSampleForReview(1, () => 0.999999)).toBe(true);
  });

  it('defaults to HUMAN_REVIEW_SAMPLE_RATE when no rate is supplied', () => {
    expect(shouldSampleForReview(undefined, () => HUMAN_REVIEW_SAMPLE_RATE - 0.001)).toBe(true);
    expect(shouldSampleForReview(undefined, () => HUMAN_REVIEW_SAMPLE_RATE + 0.001)).toBe(false);
  });

  it('defaults to Math.random() when no random source is supplied — a real call resolves to a boolean', () => {
    expect(typeof shouldSampleForReview()).toBe('boolean');
  });
});
