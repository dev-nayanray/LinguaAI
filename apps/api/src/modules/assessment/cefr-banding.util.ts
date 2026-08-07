import type { CefrLevel } from '@linguaai/database';

import { MAX_ITEMS_PER_SKILL } from './adaptive-item-selection.service.js';

/** E6 design doc §6.4 — a per-item input to banding: whether it was answered correctly and its own within-band difficulty (the weight). */
export interface ScoredItem {
  isCorrect: boolean | null;
  difficulty: number;
}

export interface SkillBandingResult {
  cefrLevel: CefrLevel;
  confidence: number;
  lowConfidence: boolean;
}

/**
 * §6.4's own provisional threshold table — a placeholder linear split, not
 * a validated psychometric cut-score set (RISK_REGISTER R-05's own open
 * item). `max` is an exclusive upper bound: `rawScore < max` selects that
 * band, giving the half-open intervals the design doc's prose describes
 * ("<30% → A1, 30–45% → A2, ..., ≥90% → C2").
 */
const BANDING_THRESHOLDS: ReadonlyArray<{ max: number; level: CefrLevel }> = [
  { max: 0.3, level: 'A1' },
  { max: 0.45, level: 'A2' },
  { max: 0.6, level: 'B1' },
  { max: 0.75, level: 'B2' },
  { max: 0.9, level: 'C1' },
  { max: Infinity, level: 'C2' },
];

/** Below this, a result is flagged `lowConfidence` (PRD.md §5.1's "never presents as definitive" bar) — provisional, the same honesty class as the threshold table above and ADR-034's cost thresholds. */
const CONFIDENCE_FLOOR = 0.5;

/**
 * §6.4: "raw score = percentage of served items answered correctly,
 * weighted by each item's own difficulty" + "confidence = a function of
 * (a) how many items were served... and (b) response consistency."
 * Neither formula is fully specified by the design doc's own prose — both
 * are concrete, documented choices made here, not silently invented:
 *
 * - Raw score: difficulty-weighted accuracy, `Σ(isCorrect ? difficulty : 0) / Σ(difficulty)`
 *   — a correct answer on a harder item counts for more than one on an easier item.
 * - Confidence: the unweighted average of two 0–1 factors —
 *   `itemCountFactor` (items served, scaled against `MAX_ITEMS_PER_SKILL`,
 *   the same ceiling the selector itself enforces) and `consistencyFactor`
 *   (`1 - 4·p·(1-p)`, where `p` is the plain fraction correct — this is
 *   `1` when every response agreed, `0` at maximum 50/50 inconsistency,
 *   the "high variance near a boundary means low confidence" case §6.4
 *   describes).
 *
 * A skill with zero served items (a possible, if unusual, outcome against
 * T1's sparse seed bank — a language/skill pair with no active items at
 * all) has no data to band: defaults to A1 with confidence 0, always
 * flagged low-confidence, rather than a fabricated mid-range guess.
 */
export function computeSkillBanding(items: readonly ScoredItem[]): SkillBandingResult {
  if (items.length === 0) {
    return { cefrLevel: 'A1', confidence: 0, lowConfidence: true };
  }

  const totalDifficulty = items.reduce((sum, item) => sum + item.difficulty, 0);
  const earnedDifficulty = items.reduce(
    (sum, item) => sum + (item.isCorrect ? item.difficulty : 0),
    0,
  );
  const rawScore = totalDifficulty > 0 ? earnedDifficulty / totalDifficulty : 0;

  const cefrLevel = BANDING_THRESHOLDS.find((threshold) => rawScore < threshold.max)?.level ?? 'C2';

  const itemCountFactor = Math.min(items.length / MAX_ITEMS_PER_SKILL, 1);
  const correctFraction = items.filter((item) => item.isCorrect).length / items.length;
  const consistencyFactor = 1 - 4 * correctFraction * (1 - correctFraction);
  const confidence = 0.5 * itemCountFactor + 0.5 * consistencyFactor;

  return { cefrLevel, confidence, lowConfidence: confidence < CONFIDENCE_FLOOR };
}
