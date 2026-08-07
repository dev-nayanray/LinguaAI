import { computeSkillBanding, type ScoredItem } from './cefr-banding.util.js';

function makeUniformItems(correctCount: number, total: number, difficulty = 1): ScoredItem[] {
  return Array.from({ length: total }, (_, i) => ({ isCorrect: i < correctCount, difficulty }));
}

describe('computeSkillBanding', () => {
  describe('banding threshold boundaries (§6.4: <30% A1, 30-45% A2, 45-60% B1, 60-75% B2, 75-90% C1, >=90% C2)', () => {
    it.each([
      [0, 20, 'A1'],
      [5, 20, 'A1'], // 25% — just below the A2 boundary
      [6, 20, 'A2'], // exactly 30%
      [8, 20, 'A2'],
      [9, 20, 'B1'], // exactly 45%
      [11, 20, 'B1'],
      [12, 20, 'B2'], // exactly 60%
      [14, 20, 'B2'],
      [15, 20, 'C1'], // exactly 75%
      [17, 20, 'C1'],
      [18, 20, 'C2'], // exactly 90%
      [20, 20, 'C2'],
    ] as const)('%i/%i correct -> %s', (correctCount, total, expectedLevel) => {
      const result = computeSkillBanding(makeUniformItems(correctCount, total));
      expect(result.cefrLevel).toBe(expectedLevel);
    });
  });

  it('weights by item difficulty, not plain accuracy — a correct hard item can outweigh an incorrect easy one', () => {
    // Plain accuracy is 50% (1 of 2 correct), which alone would land B1
    // (45-60%). Difficulty-weighted: 3/(3+1) = 75% -> C1.
    const items: ScoredItem[] = [
      { isCorrect: true, difficulty: 3 },
      { isCorrect: false, difficulty: 1 },
    ];
    const result = computeSkillBanding(items);
    expect(result.cefrLevel).toBe('C1');
  });

  describe('confidence', () => {
    it('increases with more served items when responses are fully consistent', () => {
      const oneItem = computeSkillBanding(makeUniformItems(1, 1));
      const fiveItems = computeSkillBanding(makeUniformItems(5, 5));
      expect(fiveItems.confidence).toBeGreaterThan(oneItem.confidence);
      expect(fiveItems.confidence).toBeCloseTo(1, 5);
    });

    it('is identical whether responses are all-correct or all-incorrect — both are fully consistent', () => {
      const allCorrect = computeSkillBanding(makeUniformItems(3, 3));
      const allIncorrect = computeSkillBanding(makeUniformItems(0, 3));
      expect(allCorrect.confidence).toBeCloseTo(allIncorrect.confidence, 10);
    });

    it('drops toward 0 as responses approach a 50/50 split (maximum inconsistency)', () => {
      const consistent = computeSkillBanding(makeUniformItems(4, 4));
      const inconsistent = computeSkillBanding(makeUniformItems(2, 4));
      expect(inconsistent.confidence).toBeLessThan(consistent.confidence);
    });

    it('flags lowConfidence below the 0.5 floor and not above it', () => {
      // 4 items, 50/50 split: itemCountFactor 0.8, consistencyFactor 0 -> confidence 0.4.
      const low = computeSkillBanding(makeUniformItems(2, 4));
      expect(low.confidence).toBeCloseTo(0.4, 5);
      expect(low.lowConfidence).toBe(true);

      // 5 items, all correct: confidence 1.0.
      const high = computeSkillBanding(makeUniformItems(5, 5));
      expect(high.lowConfidence).toBe(false);
    });
  });

  it('defaults to A1 with confidence 0 (always low-confidence) when no items were served', () => {
    const result = computeSkillBanding([]);
    expect(result).toEqual({ cefrLevel: 'A1', confidence: 0, lowConfidence: true });
  });
});
