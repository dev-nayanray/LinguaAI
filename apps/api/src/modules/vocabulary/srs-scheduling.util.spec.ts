import { applySm2Review, type SrsCardState } from './srs-scheduling.util.js';

const BRAND_NEW: SrsCardState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

describe('applySm2Review', () => {
  describe('failed recall (quality < 3)', () => {
    it('resets repetitions to 0 and interval to 1 day, regardless of prior state', () => {
      const result = applySm2Review({ easeFactor: 2.8, intervalDays: 30, repetitions: 5 }, 2);

      expect(result.repetitions).toBe(0);
      expect(result.intervalDays).toBe(1);
    });

    it('still applies the ease-factor formula on a failure (quality 0 lowers it the most)', () => {
      const result = applySm2Review(BRAND_NEW, 0);

      expect(result.easeFactor).toBeLessThan(BRAND_NEW.easeFactor);
    });

    it('floors the ease factor at 1.3, never letting repeated failures push it lower', () => {
      let state = BRAND_NEW;
      for (let i = 0; i < 20; i++) {
        state = applySm2Review(state, 0);
      }

      expect(state.easeFactor).toBe(1.3);
    });
  });

  describe('successful recall (quality >= 3)', () => {
    it('the first successful review sets repetitions to 1 and interval to 1 day', () => {
      const result = applySm2Review(BRAND_NEW, 4);

      expect(result.repetitions).toBe(1);
      expect(result.intervalDays).toBe(1);
    });

    it('the second successful review sets repetitions to 2 and interval to 6 days', () => {
      const afterFirst = applySm2Review(BRAND_NEW, 4);
      const afterSecond = applySm2Review(afterFirst, 4);

      expect(afterSecond.repetitions).toBe(2);
      expect(afterSecond.intervalDays).toBe(6);
    });

    it('the third+ successful review multiplies the prior interval by the new ease factor, rounded', () => {
      const afterFirst = applySm2Review(BRAND_NEW, 4);
      const afterSecond = applySm2Review(afterFirst, 4);
      const afterThird = applySm2Review(afterSecond, 4);

      const expectedEaseFactor = afterSecond.easeFactor + (0.1 - 1 * (0.08 + 1 * 0.02));
      const expectedInterval = Math.round(afterSecond.intervalDays * expectedEaseFactor);
      expect(afterThird.repetitions).toBe(3);
      expect(afterThird.intervalDays).toBe(expectedInterval);
    });

    it('a perfect recall (quality 5) increases the ease factor', () => {
      const result = applySm2Review(BRAND_NEW, 5);

      expect(result.easeFactor).toBeGreaterThan(BRAND_NEW.easeFactor);
    });

    it('a passing-but-hesitant recall (quality 3) decreases the ease factor', () => {
      const result = applySm2Review(BRAND_NEW, 3);

      expect(result.easeFactor).toBeLessThan(BRAND_NEW.easeFactor);
    });
  });

  it('a failure after growth resets progress but the next success starts the 1/6-day stages over', () => {
    const afterFirst = applySm2Review(BRAND_NEW, 4);
    const afterSecond = applySm2Review(afterFirst, 4);
    const afterThird = applySm2Review(afterSecond, 4);
    const afterFailure = applySm2Review(afterThird, 1);
    expect(afterFailure.repetitions).toBe(0);
    expect(afterFailure.intervalDays).toBe(1);

    const afterRecovery = applySm2Review(afterFailure, 4);
    expect(afterRecovery.repetitions).toBe(1);
    expect(afterRecovery.intervalDays).toBe(1);
  });
});
