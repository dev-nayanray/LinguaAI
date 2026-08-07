import { Injectable } from '@nestjs/common';
import type { AssessmentItem, CefrLevel } from '@linguaai/database';

/**
 * ADR-038 / E6 design doc §6.2 — a simplified, deterministic
 * difficulty-stepping algorithm, not a calibrated item-response-theory
 * (IRT) model (flagged provisional, RISK_REGISTER.md). Pure and I/O-free by
 * design (ADR-038's own "relocatable to recommendation-engine" reasoning):
 * `AssessmentService` does every Prisma read and passes plain data in.
 */
const BAND_ORDER: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const START_BAND_INDEX = BAND_ORDER.indexOf('B1');
const MAX_ITEMS_PER_SKILL = 5;
/** At least this many *post-response* band values must agree before the estimate counts as stabilized (§6.2). */
const STABILIZE_STREAK = 2;
const DIFFICULTY_STEP = 0.25;
const START_DIFFICULTY_TARGET = 0.5;

export interface SelectionHistoryEntry {
  isCorrect: boolean | null;
}

export interface SelectionResult {
  item: AssessmentItem | null;
  /** True when the skill has reached its stop condition (max items, stabilized, or the item bank has nothing left to serve) — `item` is then always null. */
  skillComplete: boolean;
}

@Injectable()
export class AdaptiveItemSelectionService {
  /**
   * `candidates` must already be filtered to this skill/language, active,
   * and not yet served this attempt (`AssessmentService`'s own query) —
   * this method makes no attempt-identity assumptions of its own, keeping
   * it a pure function of its inputs.
   */
  selectNext(candidates: AssessmentItem[], history: SelectionHistoryEntry[]): SelectionResult {
    if (history.length >= MAX_ITEMS_PER_SKILL) {
      return { item: null, skillComplete: true };
    }

    const { bandIndex, difficultyTarget, bandTrajectory } = this.computeRunningState(history);
    if (this.hasStabilized(bandTrajectory)) {
      return { item: null, skillComplete: true };
    }

    const item = this.pickClosestItem(candidates, bandIndex, difficultyTarget);
    return item ? { item, skillComplete: false } : { item: null, skillComplete: true };
  }

  /**
   * Real bug found and fixed during implementation, not in the design
   * doc's own §6.2 text: stabilization must compare the band *after* each
   * response is applied (`bandTrajectory`), never the band the *served*
   * item itself came from. The first response's band is always the fixed
   * starting band by construction (a single ±0.25 step from the 0.5 center
   * can never cross the [0,1] range), so comparing served-item bands for
   * the first two items would make every skill "stabilize" after exactly 2
   * items, every time, regardless of correctness — silently defeating the
   * entire adaptive mechanism (MAX_ITEMS_PER_SKILL, band-crossing, all of
   * it, would never actually run). Comparing post-response bands and
   * requiring at least `STABILIZE_STREAK + 1` responses before evaluating
   * at all (the first entry's post-response band carries no signal, for
   * the same reason) fixes this.
   */
  private hasStabilized(bandTrajectory: number[]): boolean {
    if (bandTrajectory.length < STABILIZE_STREAK + 1) {
      return false;
    }
    const recent = bandTrajectory.slice(-STABILIZE_STREAK);
    return new Set(recent).size === 1;
  }

  private computeRunningState(history: SelectionHistoryEntry[]): {
    bandIndex: number;
    difficultyTarget: number;
    /** `bandTrajectory[i]` is the band index immediately after processing `history[i]` — used only by `hasStabilized`. */
    bandTrajectory: number[];
  } {
    let bandIndex = START_BAND_INDEX;
    let difficultyTarget = START_DIFFICULTY_TARGET;
    const bandTrajectory: number[] = [];

    for (const entry of history) {
      if (entry.isCorrect) {
        difficultyTarget += DIFFICULTY_STEP;
        if (difficultyTarget > 1) {
          bandIndex = Math.min(bandIndex + 1, BAND_ORDER.length - 1);
          difficultyTarget = 0.25;
        }
      } else {
        difficultyTarget -= DIFFICULTY_STEP;
        if (difficultyTarget < 0) {
          bandIndex = Math.max(bandIndex - 1, 0);
          difficultyTarget = 0.75;
        }
      }
      bandTrajectory.push(bandIndex);
    }

    return { bandIndex, difficultyTarget, bandTrajectory };
  }

  /**
   * Real, load-bearing extension beyond the design doc's own §6.2 text
   * (ADR-038's Context): the seed item bank (E6 T1) only spans A1/B1/C1,
   * not all six bands, so a strict "this band only" rule would dead-end the
   * moment the running target steps into an unseeded band (A2/B2/C2).
   * Falls back to the nearest band (by index distance, either direction)
   * that still has an unserved item before concluding the skill has no more
   * content to serve.
   */
  private pickClosestItem(
    candidates: AssessmentItem[],
    bandIndex: number,
    difficultyTarget: number,
  ): AssessmentItem | null {
    if (candidates.length === 0) {
      return null;
    }

    const byBandIndex = new Map<number, AssessmentItem[]>();
    for (const item of candidates) {
      const idx = BAND_ORDER.indexOf(item.cefrLevel);
      const bucket = byBandIndex.get(idx) ?? [];
      bucket.push(item);
      byBandIndex.set(idx, bucket);
    }

    for (let distance = 0; distance < BAND_ORDER.length; distance++) {
      const pool =
        distance === 0
          ? (byBandIndex.get(bandIndex) ?? [])
          : [
              ...(byBandIndex.get(bandIndex - distance) ?? []),
              ...(byBandIndex.get(bandIndex + distance) ?? []),
            ];
      if (pool.length > 0) {
        return pool.reduce((closest, current) =>
          Math.abs(current.difficulty - difficultyTarget) <
          Math.abs(closest.difficulty - difficultyTarget)
            ? current
            : closest,
        );
      }
    }

    return null;
  }
}
