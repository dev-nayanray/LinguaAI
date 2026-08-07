import { CEFR_LEVELS } from '@linguaai/types/learning';
import type { ActivityType, CefrLevel, Skill } from '@linguaai/database';

import {
  ACTIVITY_TYPE_TO_SKILL,
  MIN_HISTORY_ENTRIES_FOR_TREND,
  MIN_RECENT_EXERCISE_ATTEMPTS_FOR_SIGNAL,
  WEAK_ACCURACY_THRESHOLD,
} from './weakness-detection.constants.js';

export interface SkillHistoryPoint {
  skill: Skill;
  cefrLevel: CefrLevel;
  recordedAt: Date;
}

export interface ExerciseSignal {
  activityType: ActivityType;
  isCorrect: boolean;
}

export type WeaknessReason = 'REGRESSED' | 'NO_IMPROVEMENT' | 'LOW_ACCURACY';

export interface WeaknessResult {
  skill: Skill;
  isWeak: boolean;
  reason: WeaknessReason | null;
}

/**
 * E7 design doc §6.4 — pure, I/O-free (the same "relocatable, no
 * service-specific dependency" design `AdaptiveItemSelectionService`
 * already established, E6 ADR-038): `WeaknessDetectionService` does every
 * Prisma read and hands plain arrays in.
 *
 * A skill only appears in the result at all if it has *some* signal
 * (history or exercise data) — zero data for a skill is never flagged
 * weak by default, the same "omit, don't fabricate a negative result from
 * an absence of data" precedent `computeWritingBanding` already
 * established (E6 T7), not `computeSkillBanding`'s own zero-items default
 * (which was only correct there because the four objective skills are
 * always expected to have content — an assumption that does not hold for
 * this platform's own near-empty curriculum content today, E7 design doc
 * §3.2).
 *
 * A skill is weak if *either* signal trips: its own CEFR trend across
 * `ProficiencyLevelHistory` regressed or didn't improve since the
 * previous re-assessment, or its own recent `ExerciseAttempt` accuracy
 * fell below the provisional floor. Both are checked independently —
 * history takes priority when both would apply, since a real
 * regression/plateau is a stronger signal than a handful of recent wrong
 * answers.
 */
export function detectWeakSkills(
  history: readonly SkillHistoryPoint[],
  exerciseSignals: readonly ExerciseSignal[],
): WeaknessResult[] {
  const historyBySkill = new Map<Skill, SkillHistoryPoint[]>();
  for (const point of history) {
    const points = historyBySkill.get(point.skill) ?? [];
    points.push(point);
    historyBySkill.set(point.skill, points);
  }

  const exerciseBySkill = new Map<Skill, ExerciseSignal[]>();
  for (const signal of exerciseSignals) {
    const skill = ACTIVITY_TYPE_TO_SKILL[signal.activityType];
    if (!skill) {
      continue;
    }
    const signals = exerciseBySkill.get(skill) ?? [];
    signals.push(signal);
    exerciseBySkill.set(skill, signals);
  }

  const skillsWithData = new Set<Skill>([...historyBySkill.keys(), ...exerciseBySkill.keys()]);

  return [...skillsWithData].map((skill) => {
    const historyReason = detectHistoryWeakness(historyBySkill.get(skill) ?? []);
    const reason = historyReason ?? detectAccuracyWeakness(exerciseBySkill.get(skill) ?? []);
    return { skill, isWeak: reason !== null, reason };
  });
}

function detectHistoryWeakness(
  points: readonly SkillHistoryPoint[],
): 'REGRESSED' | 'NO_IMPROVEMENT' | null {
  if (points.length < MIN_HISTORY_ENTRIES_FOR_TREND) {
    return null;
  }
  const sorted = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const previous = sorted[sorted.length - 2]!;
  const latest = sorted[sorted.length - 1]!;
  const previousIndex = CEFR_LEVELS.indexOf(previous.cefrLevel);
  const latestIndex = CEFR_LEVELS.indexOf(latest.cefrLevel);

  if (latestIndex < previousIndex) {
    return 'REGRESSED';
  }
  if (latestIndex === previousIndex) {
    return 'NO_IMPROVEMENT';
  }
  return null;
}

function detectAccuracyWeakness(signals: readonly ExerciseSignal[]): 'LOW_ACCURACY' | null {
  if (signals.length < MIN_RECENT_EXERCISE_ATTEMPTS_FOR_SIGNAL) {
    return null;
  }
  const correctCount = signals.filter((signal) => signal.isCorrect).length;
  const accuracy = correctCount / signals.length;
  return accuracy < WEAK_ACCURACY_THRESHOLD ? 'LOW_ACCURACY' : null;
}
