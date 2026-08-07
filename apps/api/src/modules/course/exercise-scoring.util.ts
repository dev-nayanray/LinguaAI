import { UnprocessableEntityException } from '@nestjs/common';
import type { Exercise } from '@linguaai/database';
import type { SubmitExerciseAttemptRequest } from '@linguaai/validation/content';

export interface ExerciseScoreResult {
  isCorrect: boolean;
  score: number;
}

/**
 * Deterministic answer-key matching for `Exercise`'s own objective types
 * (E8 T2, §6.2/§3.8) — a new scorer, not a reuse of `AssessmentModule`'s
 * `scoreObjectiveResponse`: `ExerciseType` and `AssessmentItemType` are
 * independently-defined enums with only superficial naming overlap
 * (`MATCHING`/`TRANSLATION`/`LISTENING_COMPREHENSION` have no assessment
 * equivalent at all). `correctAnswer`/`response` shapes reuse the same
 * field-naming convention `objective-scoring.util.ts` already established
 * (`{ correctIndex }`/`{ selectedIndex }`, `{ acceptable }`/`{ text }`) for
 * the overlapping cases, rather than inventing different names for the
 * same concept.
 *
 * `SPEAKING_PROMPT` is never reached — `ExerciseAttemptsService` rejects it
 * (422) before this function is ever called, the same "excluded at the
 * epic's own scope boundary" design as `SPEAKING`'s own exclusion from E6
 * assessment scoring (needs `services/speech-service`, not yet built until
 * E10). The throw below is a defensive guard against that branch itself
 * breaking, not a real runtime path today.
 */
export function scoreExerciseResponse(
  exercise: Pick<Exercise, 'type' | 'correctAnswer'>,
  response: SubmitExerciseAttemptRequest['response'],
): ExerciseScoreResult {
  if (exercise.type === 'MULTIPLE_CHOICE' || exercise.type === 'LISTENING_COMPREHENSION') {
    if (!('selectedIndex' in response)) {
      throw new UnprocessableEntityException(
        `${exercise.type} items require a response shaped { selectedIndex }`,
      );
    }
    const correctAnswer = exercise.correctAnswer as { correctIndex: number } | null;
    const isCorrect =
      correctAnswer !== null && response.selectedIndex === correctAnswer.correctIndex;
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  if (exercise.type === 'FILL_BLANK' || exercise.type === 'TRANSLATION') {
    if (!('text' in response)) {
      throw new UnprocessableEntityException(
        `${exercise.type} items require a response shaped { text }`,
      );
    }
    const correctAnswer = exercise.correctAnswer as { acceptable: string[] } | null;
    const normalized = response.text.trim().toLowerCase();
    const isCorrect =
      correctAnswer !== null &&
      correctAnswer.acceptable.some((a) => a.trim().toLowerCase() === normalized);
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  if (exercise.type === 'MATCHING') {
    if (!('matches' in response)) {
      throw new UnprocessableEntityException(
        'MATCHING items require a response shaped { matches }',
      );
    }
    const correctAnswer = exercise.correctAnswer as {
      pairs: Array<{ left: string; right: string }>;
    } | null;
    const canonicalize = (pairs: Array<{ left: string; right: string }>): Set<string> =>
      new Set(pairs.map((p) => `${p.left.trim().toLowerCase()}|||${p.right.trim().toLowerCase()}`));
    const isCorrect =
      correctAnswer !== null &&
      correctAnswer.pairs.length === response.matches.length &&
      setsEqual(canonicalize(correctAnswer.pairs), canonicalize(response.matches));
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  throw new UnprocessableEntityException(
    `${exercise.type} is not objectively scoreable in this epic's own scope (§1) — SPEAKING_PROMPT needs services/speech-service, not yet built until E10`,
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}
