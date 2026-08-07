// Learning bounded context (ARCHITECTURE.md §2.1). First real content
// (E6-T2): Assessment attempt-lifecycle request/response schemas, mirroring
// @linguaai/types/learning field-for-field, matching the identity context's
// established schema-plus-drift-guard pattern.

import { z } from 'zod';
import {
  ASSESSMENT_ITEM_TYPES,
  ASSESSMENT_STATUSES,
  ASSESSMENT_TYPES,
  CEFR_LEVELS,
  PROFICIENCY_SOURCES,
  SKILLS,
  type AssessmentAttempt,
  type AssessmentResponse,
  type DailyGoal,
  type LearningPlan,
  type ProficiencyLevel,
} from '@linguaai/types/learning';

/**
 * Compile-time-only drift guard (identical pattern to @linguaai/validation/identity's
 * own `assertExtends`): fails to compile if a schema's inferred shape stops
 * matching its canonical @linguaai/types/learning interface. Never invoked
 * for any runtime effect.
 */
function assertExtends<Expected, Actual extends Expected>(_witness?: Actual): void {
  // no-op — see doc comment above; `Actual` is referenced in `_witness`'s
  // type so it isn't flagged as an unused type parameter.
}

export const skillSchema = z.enum(SKILLS);
export const cefrLevelSchema = z.enum(CEFR_LEVELS);
export const assessmentTypeSchema = z.enum(ASSESSMENT_TYPES);
export const assessmentStatusSchema = z.enum(ASSESSMENT_STATUSES);
export const assessmentItemTypeSchema = z.enum(ASSESSMENT_ITEM_TYPES);
export const proficiencySourceSchema = z.enum(PROFICIENCY_SOURCES);

export const assessmentAttemptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  languageId: z.string().uuid(),
  type: assessmentTypeSchema,
  status: assessmentStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
assertExtends<AssessmentAttempt, z.infer<typeof assessmentAttemptSchema>>();

export const assessmentResponseSchema = z.object({
  id: z.string().uuid(),
  attemptId: z.string().uuid(),
  itemId: z.string().uuid().nullable(),
  skill: skillSchema,
  prompt: z.string().min(1),
  response: z.record(z.string(), z.unknown()),
  isCorrect: z.boolean().nullable(),
  score: z.number().nullable(),
  createdAt: z.string().datetime(),
});
assertExtends<AssessmentResponse, z.infer<typeof assessmentResponseSchema>>();

export const proficiencyLevelSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  languageId: z.string().uuid(),
  skill: skillSchema,
  cefrLevel: cefrLevelSchema,
  confidence: z.number().min(0).max(1),
  source: proficiencySourceSchema,
});
assertExtends<ProficiencyLevel, z.infer<typeof proficiencyLevelSchema>>();

// --- Endpoint request/response payloads (E6-T2, ADR-038) ---

/** `POST /v1/assessment-attempts` request body. */
export const startAssessmentAttemptRequestSchema = z.object({
  languageId: z.string().uuid(),
  type: assessmentTypeSchema.default('PLACEMENT'),
});
export type StartAssessmentAttemptRequest = z.infer<typeof startAssessmentAttemptRequestSchema>;

/**
 * The item shape served to a client taking the assessment — deliberately
 * omits `correctAnswer` (the answer key) and `languageId`/`isActive`
 * (server-internal selection inputs). Kept as its own independent literal
 * shape, not `.omit()`'d from a schema that itself carries `correctAnswer`,
 * so a future careless `.extend()` elsewhere can't accidentally leak the
 * answer key through this type (E6 design doc §6.3's scoring-integrity bar).
 */
export const assessmentItemPublicViewSchema = z.object({
  id: z.string().uuid(),
  skill: skillSchema,
  cefrLevel: cefrLevelSchema,
  difficulty: z.number(),
  prompt: z.string().min(1),
  audioUrl: z.string().url().nullable(),
  itemType: assessmentItemTypeSchema,
});
export type AssessmentItemPublicView = z.infer<typeof assessmentItemPublicViewSchema>;

/** `POST /v1/assessment-attempts` response body. */
export const startAssessmentAttemptResponseSchema = z.object({
  attempt: assessmentAttemptSchema,
  nextItem: assessmentItemPublicViewSchema,
});
export type StartAssessmentAttemptResponse = z.infer<typeof startAssessmentAttemptResponseSchema>;

/**
 * `POST /v1/assessment-attempts/:id/responses` request body. `response`'s
 * two shapes are keyed by the item's own `itemType`, looked up server-side —
 * never a client-supplied discriminant (Part 9C's "never trust a
 * client-supplied value feeding a privileged decision" discipline,
 * E2-identity-access-platform.md, applied here to scoring integrity).
 */
export const submitAssessmentResponseValueSchema = z.union([
  z.object({ selectedIndex: z.number().int().min(0) }),
  z.object({ text: z.string().min(1).max(5000) }),
]);
export const submitAssessmentResponseRequestSchema = z.object({
  itemId: z.string().uuid(),
  response: submitAssessmentResponseValueSchema,
});
export type SubmitAssessmentResponseRequest = z.infer<typeof submitAssessmentResponseRequestSchema>;

/** `POST /v1/assessment-attempts/:id/responses` response body. */
export const submitAssessmentResponseResponseSchema = z.object({
  response: z.object({
    id: z.string().uuid(),
    isCorrect: z.boolean().nullable(),
    score: z.number().nullable(),
  }),
  nextItem: assessmentItemPublicViewSchema.nullable(),
  attemptStatus: assessmentStatusSchema,
});
export type SubmitAssessmentResponseResponse = z.infer<
  typeof submitAssessmentResponseResponseSchema
>;

/**
 * Per-skill result of `POST /v1/assessment-attempts/:id/complete` (E6-T3,
 * §6.4) — a computed view, not a mirror of the `ProficiencyLevel` entity
 * (no `id`/`userId`/`languageId`, redundant with the attempt's own).
 * `lowConfidence` structurally distinguishes "confident" from
 * "needs retake" results (PRD.md §5.1) — a client must not present a
 * `lowConfidence: true` result as definitive.
 */
export const skillBandingResultSchema = z.object({
  skill: skillSchema,
  cefrLevel: cefrLevelSchema,
  confidence: z.number().min(0).max(1),
  lowConfidence: z.boolean(),
});
export type SkillBandingResult = z.infer<typeof skillBandingResultSchema>;

/**
 * `POST /v1/assessment-attempts/:id/complete` response body. `responses`
 * is the raw per-item scoring record; `proficiencyLevels` (E6-T3) is the
 * banded, confidence-scored placement result computed from it — one entry
 * per objective skill served (§6.4's provisional threshold table/confidence
 * formula, not yet a validated psychometric result, RISK_REGISTER R-05).
 * `retakeRecommended` (E6-T6) is the low-confidence retake-offer contract
 * §6.4 names — `true` when any served skill's own `lowConfidence` flag is
 * set, so a client can show a single retake prompt without re-deriving the
 * same logic itself; PRD.md §5.1's "a low-confidence result never presents
 * as definitive" bar applies to the whole result once any skill trips it.
 */
export const completeAssessmentAttemptResponseSchema = z.object({
  attempt: assessmentAttemptSchema,
  responses: z.array(assessmentResponseSchema),
  proficiencyLevels: z.array(skillBandingResultSchema),
  retakeRecommended: z.boolean(),
});
export type CompleteAssessmentAttemptResponse = z.infer<
  typeof completeAssessmentAttemptResponseSchema
>;

// --- Domain event payloads (EVENT_ARCHITECTURE.md §3) ---

/**
 * The real payload shape `AssessmentService.completeAttempt()` publishes
 * for `assessment.attempt.completed` (E6-T6). Moved here from
 * `apps/api/src/modules/assessment/assessment-events.ts` (E7-T2) — a
 * consumer outside `apps/api` (`recommendation-engine`, `EVENT_ARCHITECTURE.md`'s
 * own already-cataloged consumer) cannot import from `apps/*` (ADR-015's
 * module-boundary rule), so this schema has to live in a shared package
 * either way; `@linguaai/validation` is the same single-source-of-truth
 * location every other wire-contract schema in this bounded context
 * already uses. The producer (`apps/api`) and every consumer import the
 * exact same schema — the same "one schema, not a hand-copied duplicate
 * that could silently drift" discipline `event-catalog-conformance.spec.ts`
 * (E6-T6) already established.
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

/**
 * The real payload shape `DailyGoalService.generateForPlan()` publishes for
 * `recommendation.daily_goal.ready` (E7 T4, §6.5) — closes §3.4's found gap
 * (`ARCHITECTURE.md` §6 narrated a "plan ready" event `notification-service`
 * consumes; no such row existed in `EVENT_ARCHITECTURE.md`'s actual catalog
 * until this task). Lives here, not `services/recommendation-engine`-local,
 * for the same reason `assessmentAttemptCompletedPayloadSchema` does: its
 * real consumers (`notification-service`, `analytics-service`) cannot
 * import from `services/recommendation-engine`'s own `src/` internals
 * (this repo's own "consume a package's public exports only" rule), so the
 * producer and every consumer share this one schema. `date` is a plain
 * `YYYY-MM-DD` calendar-date string — the same value `toLocalCalendarDate`/
 * `nextCalendarDate` (`packages/utils`) already compute in the user's own
 * timezone, not a UTC instant a consumer would have to re-localize.
 */
export const recommendationDailyGoalReadyPayloadSchema = z.object({
  userId: z.string().uuid(),
  date: z.string().date(),
  targetXp: z.number().int().positive(),
  targetMinutes: z.number().int().positive(),
  targetActivities: z.number().int().positive(),
});
export type RecommendationDailyGoalReadyPayload = z.infer<
  typeof recommendationDailyGoalReadyPayloadSchema
>;

// --- apps/api REST contract (E7 T5, §6.6) — pure reads of recommendation-engine's own precomputed rows ---

/**
 * `GET /v1/learning-plans/current` / `GET /v1/daily-goals/today` response
 * shapes. Both are wire views of a `recommendation-engine`-owned Prisma
 * row, not the Prisma type itself — timestamps as ISO strings, matching
 * every other wire type in this file (`assessmentAttemptSchema` etc.), not
 * `packages/database`'s own `Date`-typed generated client.
 */
export const learningPlanResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  languageId: z.string().uuid(),
  goal: z.string(),
  targetDate: z.string().datetime().nullable(),
  milestones: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<LearningPlan, z.infer<typeof learningPlanResponseSchema>>();
export type LearningPlanResponse = z.infer<typeof learningPlanResponseSchema>;

/**
 * `LearningPlan` has no uniqueness constraint scoping "one active plan per
 * user" — only `@@index([userId, languageId])` — because `UserProfile.
 * targetLanguages` (identity.prisma) is a real array, so a genuinely
 * multi-language learner can have more than one active `LearningPlan`
 * simultaneously. §6.6's own design text names a single "current" plan
 * without addressing this — a real, found scope gap, resolved here (not
 * left silently underspecified): `languageId` is an optional filter; when
 * given, `.../current` resolves that language's own active plan (404 if
 * none); when omitted, it falls back to the caller's most-recently-updated
 * active plan across every language, a documented, deliberate default for
 * the common single-target-language case, not an arbitrary one.
 */
export const currentLearningPlanQuerySchema = z.object({
  languageId: z.string().uuid().optional(),
});
export type CurrentLearningPlanQuery = z.infer<typeof currentLearningPlanQuerySchema>;

/**
 * `DailyGoal` carries no `languageId` at all (`@@unique([userId, date])`
 * only) — one goal per user per day platform-wide, regardless of how many
 * languages they're learning — so unlike `LearningPlan`, `.../today` needs
 * no equivalent query-param disambiguation.
 */
export const dailyGoalResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  learningPlanId: z.string().uuid().nullable(),
  date: z.string().date(),
  targetXp: z.number().int(),
  targetMinutes: z.number().int(),
  targetActivities: z.number().int(),
  completed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<DailyGoal, z.infer<typeof dailyGoalResponseSchema>>();
export type DailyGoalResponse = z.infer<typeof dailyGoalResponseSchema>;

// --- Domain event payloads (EVENT_ARCHITECTURE.md §3) — E8 T3, §6.3 ---

/**
 * The real payload shape `ExerciseAttemptsService.submitAttempt()`
 * (`apps/api/src/modules/course/`) publishes for `learning.exercise.answered`
 * on every scored `ExerciseAttempt` — closing §3.2 of the E8 design doc's
 * own found gap (this event was already cataloged, Producer "`apps/api`",
 * but had never had a real producer until this task). Lives here, not
 * `apps/api`-local, matching `assessmentAttemptCompletedPayloadSchema`'s
 * own precedent: `recommendation-engine`/`analytics-service` (this event's
 * real cataloged consumers) cannot import from `apps/*` (ADR-015).
 */
export const learningExerciseAnsweredPayloadSchema = z.object({
  userId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  correct: z.boolean(),
});
export type LearningExerciseAnsweredPayload = z.infer<typeof learningExerciseAnsweredPayloadSchema>;

/**
 * The real payload shape `ExerciseAttemptsService` publishes for
 * `learning.lesson.completed` — the moment every attemptable `Exercise` in
 * a `Lesson`'s own `Activity` set has at least one attempt on record for a
 * user (E8 design doc §6.3/§10 open question #2, resolved here). `score`
 * is a real, documented, provisional formula, not silently invented: the
 * *most recent* attempt's own `score` per exercise, averaged across every
 * exercise in the lesson — chosen over "average of all attempts" so a
 * learner who initially struggled but ultimately answered correctly gets
 * credit for their current understanding, not penalized for practicing.
 * `SPEAKING_PROMPT` exercises are excluded from both the completion check
 * and this average — they can never be attempted at all in this epic's own
 * scope (§1, rejected 422 until `services/speech-service`, E10), so
 * requiring one would make any lesson containing one permanently
 * uncompletable.
 */
export const learningLessonCompletedPayloadSchema = z.object({
  userId: z.string().uuid(),
  lessonId: z.string().uuid(),
  score: z.number().min(0).max(1),
});
export type LearningLessonCompletedPayload = z.infer<typeof learningLessonCompletedPayloadSchema>;
