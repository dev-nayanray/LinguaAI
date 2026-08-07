import {
  detectWeakSkills,
  type ExerciseSignal,
  type SkillHistoryPoint,
} from './weakness-detection.util.js';

function historyPoint(overrides: Partial<SkillHistoryPoint> = {}): SkillHistoryPoint {
  return { skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-01-01'), ...overrides };
}

function exerciseSignal(overrides: Partial<ExerciseSignal> = {}): ExerciseSignal {
  return { activityType: 'READING', isCorrect: true, ...overrides };
}

describe('detectWeakSkills', () => {
  it('omits a skill entirely when there is no data at all for it (never fabricates a negative result)', () => {
    const results = detectWeakSkills([], []);
    expect(results).toEqual([]);
  });

  it('does not flag a skill weak from a single history entry — no trend can be judged yet', () => {
    const results = detectWeakSkills([historyPoint()], []);
    expect(results).toEqual([{ skill: 'READING', isWeak: false, reason: null }]);
  });

  it('flags REGRESSED when the latest CEFR band is lower than the previous one', () => {
    const results = detectWeakSkills(
      [
        historyPoint({ cefrLevel: 'B2', recordedAt: new Date('2026-01-01') }),
        historyPoint({ cefrLevel: 'B1', recordedAt: new Date('2026-02-01') }),
      ],
      [],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: true, reason: 'REGRESSED' }]);
  });

  it('flags NO_IMPROVEMENT when the latest CEFR band equals the previous one', () => {
    const results = detectWeakSkills(
      [
        historyPoint({ cefrLevel: 'B1', recordedAt: new Date('2026-01-01') }),
        historyPoint({ cefrLevel: 'B1', recordedAt: new Date('2026-02-01') }),
      ],
      [],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: true, reason: 'NO_IMPROVEMENT' }]);
  });

  it('does not flag weak when the latest CEFR band improved on the previous one', () => {
    const results = detectWeakSkills(
      [
        historyPoint({ cefrLevel: 'A2', recordedAt: new Date('2026-01-01') }),
        historyPoint({ cefrLevel: 'B1', recordedAt: new Date('2026-02-01') }),
      ],
      [],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: false, reason: null }]);
  });

  it('sorts out-of-order history entries by recordedAt before comparing the last two', () => {
    const results = detectWeakSkills(
      [
        historyPoint({ cefrLevel: 'B1', recordedAt: new Date('2026-02-01') }),
        historyPoint({ cefrLevel: 'A2', recordedAt: new Date('2026-01-01') }),
      ],
      [],
    );
    // Improved A2 -> B1 once sorted chronologically, not regressed.
    expect(results).toEqual([{ skill: 'READING', isWeak: false, reason: null }]);
  });

  it('does not flag weak on accuracy alone with fewer than the minimum recent attempts', () => {
    const results = detectWeakSkills(
      [],
      [exerciseSignal({ isCorrect: false }), exerciseSignal({ isCorrect: false })],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: false, reason: null }]);
  });

  it('flags LOW_ACCURACY once enough recent attempts fall below the threshold', () => {
    const results = detectWeakSkills(
      [],
      [
        exerciseSignal({ isCorrect: false }),
        exerciseSignal({ isCorrect: false }),
        exerciseSignal({ isCorrect: true }),
      ],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: true, reason: 'LOW_ACCURACY' }]);
  });

  it('does not flag weak when recent accuracy is at or above the threshold', () => {
    const results = detectWeakSkills(
      [],
      [
        exerciseSignal({ isCorrect: true }),
        exerciseSignal({ isCorrect: true }),
        exerciseSignal({ isCorrect: false }),
      ],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: false, reason: null }]);
  });

  it('excludes CONVERSATION activity signals — no Skill equivalent exists to attribute them to', () => {
    const results = detectWeakSkills(
      [],
      [
        exerciseSignal({ activityType: 'CONVERSATION', isCorrect: false }),
        exerciseSignal({ activityType: 'CONVERSATION', isCorrect: false }),
        exerciseSignal({ activityType: 'CONVERSATION', isCorrect: false }),
      ],
    );
    expect(results).toEqual([]);
  });

  it('maps VOCABULARY_DRILL/GRAMMAR_EXPLANATION activity types to their own distinct skills', () => {
    const results = detectWeakSkills(
      [],
      [
        exerciseSignal({ activityType: 'VOCABULARY_DRILL', isCorrect: false }),
        exerciseSignal({ activityType: 'VOCABULARY_DRILL', isCorrect: false }),
        exerciseSignal({ activityType: 'VOCABULARY_DRILL', isCorrect: false }),
        exerciseSignal({ activityType: 'GRAMMAR_EXPLANATION', isCorrect: true }),
        exerciseSignal({ activityType: 'GRAMMAR_EXPLANATION', isCorrect: true }),
        exerciseSignal({ activityType: 'GRAMMAR_EXPLANATION', isCorrect: true }),
      ],
    );
    expect(results).toEqual(
      expect.arrayContaining([
        { skill: 'VOCABULARY', isWeak: true, reason: 'LOW_ACCURACY' },
        { skill: 'GRAMMAR', isWeak: false, reason: null },
      ]),
    );
  });

  it('prioritizes a history-based reason over an accuracy-based one when both would apply to the same skill', () => {
    const results = detectWeakSkills(
      [
        historyPoint({ cefrLevel: 'B2', recordedAt: new Date('2026-01-01') }),
        historyPoint({ cefrLevel: 'B1', recordedAt: new Date('2026-02-01') }),
      ],
      [
        exerciseSignal({ isCorrect: false }),
        exerciseSignal({ isCorrect: false }),
        exerciseSignal({ isCorrect: false }),
      ],
    );
    expect(results).toEqual([{ skill: 'READING', isWeak: true, reason: 'REGRESSED' }]);
  });

  it('evaluates multiple skills independently in the same call', () => {
    const results = detectWeakSkills(
      [
        historyPoint({ skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-01-01') }),
        historyPoint({ skill: 'READING', cefrLevel: 'B2', recordedAt: new Date('2026-02-01') }),
        historyPoint({ skill: 'WRITING', cefrLevel: 'B2', recordedAt: new Date('2026-01-01') }),
        historyPoint({ skill: 'WRITING', cefrLevel: 'B1', recordedAt: new Date('2026-02-01') }),
      ],
      [],
    );
    expect(results).toEqual(
      expect.arrayContaining([
        { skill: 'READING', isWeak: false, reason: null },
        { skill: 'WRITING', isWeak: true, reason: 'REGRESSED' },
      ]),
    );
  });
});
