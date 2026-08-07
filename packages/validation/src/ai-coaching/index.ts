// AI Coaching bounded context (ARCHITECTURE.md §2.1). First real content
// (E6-T4): the Writing-skill AI scoring critique schema, mirroring
// @linguaai/types/ai-coaching field-for-field, matching the identity/
// learning contexts' established schema-plus-drift-guard pattern.

import { z } from 'zod';
import { CEFR_LEVELS } from '@linguaai/types/learning';
import type { WritingCritique } from '@linguaai/types/ai-coaching';

/**
 * Compile-time-only drift guard (identical pattern to
 * @linguaai/validation/identity and /learning's own `assertExtends`):
 * fails to compile if a schema's inferred shape stops matching its
 * canonical @linguaai/types interface. Never invoked for any runtime
 * effect.
 */
function assertExtends<Expected, Actual extends Expected>(_witness?: Actual): void {
  // no-op — see doc comment above; `Actual` is referenced in `_witness`'s
  // type so it isn't flagged as an unused type parameter.
}

export const cefrLevelSchema = z.enum(CEFR_LEVELS);

/**
 * What the model must return for `AssessmentScoringService.scoreWritingResponse()`
 * (E6-T4, ADR-039, design doc §6.3 step 3) — validated before use; a
 * malformed model response is a thrown error, never silently passed
 * through as if valid (this epic's own "reproducible scoring" bar).
 */
export const writingCritiqueSchema = z.object({
  cefrLevel: cefrLevelSchema,
  confidence: z.number().min(0).max(1),
  feedback: z.string().min(1),
});
assertExtends<WritingCritique, z.infer<typeof writingCritiqueSchema>>();
export type WritingCritiqueSchema = z.infer<typeof writingCritiqueSchema>;
