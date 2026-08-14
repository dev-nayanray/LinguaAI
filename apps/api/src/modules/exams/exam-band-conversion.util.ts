/**
 * Real IELTS raw-score-to-band conversion for objectively-scored
 * Reading/Listening sections (design doc §6.3/§10 open question #1) — a
 * percentage-correct-based approximation of IELTS's own most commonly
 * published reference table, not an authoritative per-administration
 * guarantee (IELTS itself publishes slightly different tables per test
 * version). Honestly documented as an approximation here rather than
 * presented as an invented linear scale.
 */
const BAND_THRESHOLDS: readonly { minPercentCorrect: number; band: number }[] = [
  { minPercentCorrect: 97, band: 9 },
  { minPercentCorrect: 90, band: 8.5 },
  { minPercentCorrect: 83, band: 8 },
  { minPercentCorrect: 75, band: 7.5 },
  { minPercentCorrect: 68, band: 7 },
  { minPercentCorrect: 60, band: 6.5 },
  { minPercentCorrect: 53, band: 6 },
  { minPercentCorrect: 45, band: 5.5 },
  { minPercentCorrect: 38, band: 5 },
  { minPercentCorrect: 30, band: 4.5 },
  { minPercentCorrect: 23, band: 4 },
  { minPercentCorrect: 15, band: 3.5 },
  { minPercentCorrect: 8, band: 3 },
  { minPercentCorrect: 0, band: 2.5 },
];

export function examBandFromCorrectCount(correctCount: number, totalQuestions: number): number {
  if (totalQuestions <= 0) {
    return 0;
  }
  const percentCorrect = (correctCount / totalQuestions) * 100;
  const threshold = BAND_THRESHOLDS.find((t) => percentCorrect >= t.minPercentCorrect);
  return threshold!.band;
}
