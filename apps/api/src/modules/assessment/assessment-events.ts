import { z } from 'zod';
import { assessmentTypeSchema, cefrLevelSchema, skillSchema } from '@linguaai/validation/learning';

/**
 * The real payload shape `AssessmentService.completeAttempt()` publishes
 * for `assessment.attempt.completed` (EVENT_ARCHITECTURE.md §3, E6-T6) —
 * a real schema, not an inline object literal at the call site, so the
 * event-catalog conformance test (`event-catalog-conformance.spec.ts`) has
 * something concrete to check the service's own construction against
 * rather than a hand-copied duplicate that could silently drift.
 */
export const assessmentAttemptCompletedSkillResultSchema = z.object({
  skill: skillSchema,
  cefrLevel: cefrLevelSchema,
  confidence: z.number().min(0).max(1),
  lowConfidence: z.boolean(),
});

export const assessmentAttemptCompletedPayloadSchema = z.object({
  attemptId: z.string().uuid(),
  languageId: z.string().uuid(),
  type: assessmentTypeSchema,
  skillResults: z.array(assessmentAttemptCompletedSkillResultSchema),
});
export type AssessmentAttemptCompletedPayload = z.infer<
  typeof assessmentAttemptCompletedPayloadSchema
>;
