import { UnprocessableEntityException } from '@nestjs/common';
import type { AssessmentItem } from '@linguaai/database';
import type { SubmitAssessmentResponseRequest } from '@linguaai/validation/learning';

export interface ObjectiveScoreResult {
  isCorrect: boolean;
  score: number;
}

/**
 * Deterministic answer-key matching for the 4 objective skills
 * (Reading/Listening/Vocabulary/Grammar — E6 design doc §5). `correctAnswer`
 * shapes match `AssessmentItem`'s own seed content (E6 T1,
 * packages/database/scripts/seed.ts): `{ correctIndex }` for
 * MULTIPLE_CHOICE, `{ acceptable: string[] }` for FILL_IN_BLANK.
 *
 * WRITING (OPEN_RESPONSE) is AI-scored by ai-engine (E6 T4/T5), never
 * reaches this function in practice — `AdaptiveItemSelectionService`'s own
 * skill order (ADR-038) never serves a WRITING item in T2. The throw below
 * is a defensive guard against that invariant breaking, not a real runtime
 * path today.
 */
export function scoreObjectiveResponse(
  item: Pick<AssessmentItem, 'itemType' | 'correctAnswer'>,
  response: SubmitAssessmentResponseRequest['response'],
): ObjectiveScoreResult {
  if (item.itemType === 'MULTIPLE_CHOICE') {
    if (!('selectedIndex' in response)) {
      throw new UnprocessableEntityException(
        'MULTIPLE_CHOICE items require a response shaped { selectedIndex }',
      );
    }
    const correctAnswer = item.correctAnswer as { correctIndex: number } | null;
    const isCorrect =
      correctAnswer !== null && response.selectedIndex === correctAnswer.correctIndex;
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  if (item.itemType === 'FILL_IN_BLANK') {
    if (!('text' in response)) {
      throw new UnprocessableEntityException(
        'FILL_IN_BLANK items require a response shaped { text }',
      );
    }
    const correctAnswer = item.correctAnswer as { acceptable: string[] } | null;
    const normalized = response.text.trim().toLowerCase();
    const isCorrect =
      correctAnswer !== null &&
      correctAnswer.acceptable.some((a) => a.trim().toLowerCase() === normalized);
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }

  throw new UnprocessableEntityException(
    `${item.itemType} is not objectively scoreable — Writing-skill items are AI-scored (E6 T4/T5)`,
  );
}
