// Content & curriculum bounded context (ARCHITECTURE.md §2.1). First real
// content (E8-T1): the admin authoring wire contract for Course Management
// System's hierarchy, mirroring @linguaai/types/content field-for-field,
// matching every other bounded context's own established schema-plus-
// drift-guard pattern.

import { z } from 'zod';
import { cefrLevelSchema } from '../learning/index.js';
import {
  ACTIVITY_TYPES,
  EXERCISE_TYPES,
  SCRIPT_DIRECTIONS,
  type Activity,
  type Course,
  type Exercise,
  type Lesson,
  type Level,
  type Quiz,
  type Unit,
} from '@linguaai/types/content';

/**
 * Compile-time-only drift guard (identical pattern to every other bounded
 * context's own `assertExtends`): fails to compile if a schema's inferred
 * shape stops matching its canonical @linguaai/types/content interface.
 * Never invoked for any runtime effect.
 */
function assertExtends<Expected, Actual extends Expected>(_witness?: Actual): void {
  // no-op — see doc comment above; `Actual` is referenced in `_witness`'s
  // type so it isn't flagged as an unused type parameter.
}

export const scriptDirectionSchema = z.enum(SCRIPT_DIRECTIONS);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const exerciseTypeSchema = z.enum(EXERCISE_TYPES);

/**
 * `Activity.content`'s own real, type-specific shapes for `LISTENING`/
 * `READING` (E12 T1, §3.1/§6.1) — `content.prisma`'s own header comment
 * has always promised this is "validated at the application layer," a
 * promise never kept for any `ActivityType` until now (confirmed by a
 * full-repo search: every schema touching `content` was a bare
 * `z.record`). Deliberately scoped to only these two types, the two E12's
 * own PRD modules name — the other five `ActivityType`s remain untyped, a
 * real, explicitly-tracked gap (E12 design doc §3.2/§11), not silently
 * absorbed into this change.
 *
 * Two real, distinct moments each type's own content shape passes
 * through: a *drafted* proposal (`ContentDraftingService`'s own AI
 * output, real script/passage text only — no `audioUrl` exists yet, no
 * `cefrLevel` is AI-assigned, E12 design doc §10 open question #2) and
 * the *real, persisted* shape (after an ADMIN reviews/submits — the
 * script has by then been synthesized to a real, uploaded `audioUrl`;
 * the ADMIN has assigned a real `cefrLevel`).
 */
export const draftListeningActivityContentSchema = z.object({
  script: z.string().min(1),
});
export type DraftListeningActivityContent = z.infer<typeof draftListeningActivityContentSchema>;

export const listeningActivityContentSchema = z.object({
  audioUrl: z.string().url(),
  transcript: z.string().min(1),
});
export type ListeningActivityContent = z.infer<typeof listeningActivityContentSchema>;

export const draftReadingActivityContentSchema = z.object({
  passage: z.string().min(1),
});
export type DraftReadingActivityContent = z.infer<typeof draftReadingActivityContentSchema>;

export const readingActivityContentSchema = z.object({
  passage: z.string().min(1),
  cefrLevel: cefrLevelSchema,
});
export type ReadingActivityContent = z.infer<typeof readingActivityContentSchema>;

function addNestedContentIssues(
  result: z.SafeParseReturnType<unknown, unknown>,
  ctx: z.RefinementCtx,
): void {
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ['content', ...issue.path] });
    }
  }
}

/**
 * Applied via `.superRefine()` on `activitySchema` (a *real, persisted*
 * row being read back) — `content`'s own static type stays
 * `Record<string, unknown>` (so `assertExtends`'s own drift guard against
 * `@linguaai/types/content`'s `Activity.content` still holds), but a
 * `LISTENING`/`READING` activity now gets real runtime validation of its
 * own persisted shape, every other type unchanged.
 */
function refinePersistedActivityContent(
  data: { type: string; content: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  if (data.type === 'LISTENING') {
    addNestedContentIssues(listeningActivityContentSchema.safeParse(data.content), ctx);
  } else if (data.type === 'READING') {
    addNestedContentIssues(readingActivityContentSchema.safeParse(data.content), ctx);
  }
}

/**
 * Applied to `createActivityRequestSchema` only — a real, deliberate
 * asymmetry between the two types this epic names, not an oversight.
 * `LISTENING`'s own real `audioUrl` doesn't exist yet at request time
 * (`apps/api`'s own `LessonContentService.createActivity` synthesizes it
 * server-side, E12 design doc §6.2), so the caller supplies only the
 * draft shape (`{ script }`); `READING` has no such server-side
 * transform — the caller (an ADMIN) supplies the real, final shape
 * directly, `cefrLevel` included (design doc §10 open question #2:
 * admin-assigned, not AI-estimated).
 * `updateActivityRequestSchema` is deliberately **not** refined at all —
 * `type`/`content` are both optional there, so a content-only update
 * can't be discriminated without a real DB read of the row's own current
 * `type` first; a real, honest limitation, not silently glossed over.
 */
function refineCreateActivityContent(
  data: { type: string; content: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  if (data.type === 'LISTENING') {
    addNestedContentIssues(draftListeningActivityContentSchema.safeParse(data.content), ctx);
  } else if (data.type === 'READING') {
    addNestedContentIssues(readingActivityContentSchema.safeParse(data.content), ctx);
  }
}

/** Applied to `contentDraftActivitySchema` — `ContentDraftingService`'s own AI output, real script/passage text only, no `audioUrl`/`cefrLevel` yet either type. */
function refineDraftActivityContent(
  data: { type: string; content: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  if (data.type === 'LISTENING') {
    addNestedContentIssues(draftListeningActivityContentSchema.safeParse(data.content), ctx);
  } else if (data.type === 'READING') {
    addNestedContentIssues(draftReadingActivityContentSchema.safeParse(data.content), ctx);
  }
}

// --- Entity (response) schemas ---

export const courseSchema = z.object({
  id: z.string().uuid(),
  languageId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Course, z.infer<typeof courseSchema>>();
export type CourseResponse = z.infer<typeof courseSchema>;

export const levelSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  cefrLevel: cefrLevelSchema,
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Level, z.infer<typeof levelSchema>>();
export type LevelResponse = z.infer<typeof levelSchema>;

export const unitSchema = z.object({
  id: z.string().uuid(),
  levelId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Unit, z.infer<typeof unitSchema>>();
export type UnitResponse = z.infer<typeof unitSchema>;

export const lessonSchema = z.object({
  id: z.string().uuid(),
  unitId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  estimatedMinutes: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Lesson, z.infer<typeof lessonSchema>>();
export type LessonResponse = z.infer<typeof lessonSchema>;

/** Unrefined base shape, kept separate from `activitySchema` below so downstream call sites can still `.extend()` it (a `ZodEffects`-wrapped schema, which `.superRefine()` produces, has no `.extend()`) — each such call site re-applies `refinePersistedActivityContent` itself. */
export const activityBaseSchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().uuid(),
  type: activityTypeSchema,
  title: z.string(),
  content: z.record(z.string(), z.unknown()),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const activitySchema = activityBaseSchema.superRefine(refinePersistedActivityContent);
assertExtends<Activity, z.infer<typeof activitySchema>>();
export type ActivityResponse = z.infer<typeof activitySchema>;

export const quizSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  title: z.string(),
  passingScorePercent: z.number().int().min(0).max(100).nullable(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Quiz, z.infer<typeof quizSchema>>();
export type QuizResponse = z.infer<typeof quizSchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  quizId: z.string().uuid().nullable(),
  type: exerciseTypeSchema,
  prompt: z.string().min(1),
  correctAnswer: z.record(z.string(), z.unknown()),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Exercise, z.infer<typeof exerciseSchema>>();
export type ExerciseResponse = z.infer<typeof exerciseSchema>;

// --- Admin authoring request schemas (E8-T1, §6.1) ---

export const createCourseRequestSchema = z.object({
  languageId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase, hyphen-separated'),
});
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;

export const updateCourseRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase, hyphen-separated')
    .optional(),
});
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;

export const createLevelRequestSchema = z.object({
  cefrLevel: cefrLevelSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0),
});
export type CreateLevelRequest = z.infer<typeof createLevelRequestSchema>;

export const updateLevelRequestSchema = z.object({
  cefrLevel: cefrLevelSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateLevelRequest = z.infer<typeof updateLevelRequestSchema>;

export const createUnitRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0),
});
export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

export const updateUnitRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const createLessonRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0),
  estimatedMinutes: z.number().int().min(1).optional(),
});
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;

export const updateLessonRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
});
export type UpdateLessonRequest = z.infer<typeof updateLessonRequestSchema>;

export const createActivityRequestSchema = z
  .object({
    type: activityTypeSchema,
    title: z.string().min(1),
    content: z.record(z.string(), z.unknown()),
    order: z.number().int().min(0),
  })
  .superRefine(refineCreateActivityContent);
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;

export const updateActivityRequestSchema = z.object({
  type: activityTypeSchema.optional(),
  title: z.string().min(1).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateActivityRequest = z.infer<typeof updateActivityRequestSchema>;

export const createQuizRequestSchema = z.object({
  title: z.string().min(1),
  passingScorePercent: z.number().int().min(0).max(100).optional(),
  order: z.number().int().min(0),
});
export type CreateQuizRequest = z.infer<typeof createQuizRequestSchema>;

export const updateQuizRequestSchema = z.object({
  title: z.string().min(1).optional(),
  passingScorePercent: z.number().int().min(0).max(100).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateQuizRequest = z.infer<typeof updateQuizRequestSchema>;

export const createExerciseRequestSchema = z.object({
  type: exerciseTypeSchema,
  prompt: z.string().min(1),
  correctAnswer: z.record(z.string(), z.unknown()),
  order: z.number().int().min(0),
  quizId: z.string().uuid().optional(),
});
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;

export const updateExerciseRequestSchema = z.object({
  type: exerciseTypeSchema.optional(),
  prompt: z.string().min(1).optional(),
  correctAnswer: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
  quizId: z.string().uuid().nullable().optional(),
});
export type UpdateExerciseRequest = z.infer<typeof updateExerciseRequestSchema>;

// --- Learner-facing read + exercise-attempt contract (E8-T2, §6.2) ---

/**
 * The shape served to a learner browsing a lesson — deliberately omits
 * `correctAnswer` (the answer key), the same scoring-integrity discipline
 * `assessmentItemPublicViewSchema` (@linguaai/validation/learning, E6 T2)
 * already established. Kept as its own independent literal shape, not
 * `.omit()`'d from `exerciseSchema` (which itself carries `correctAnswer`),
 * so a future careless `.extend()` on this schema can't accidentally leak
 * the answer key through — that file's own doc comment states this exact
 * reasoning verbatim.
 */
export const exercisePublicViewSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  quizId: z.string().uuid().nullable(),
  type: exerciseTypeSchema,
  prompt: z.string(),
  order: z.number().int(),
});
export type ExercisePublicView = z.infer<typeof exercisePublicViewSchema>;

/** `GET /v1/courses` query params — offset-paginated (API_GUIDELINES.md §4's own named "bounded, rarely-changing admin list" case applies equally to a learner-facing course catalog: bounded per language, not a high-churn feed). */
export const courseListQuerySchema = z.object({
  languageId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;

export const courseListResponseSchema = z.object({
  data: z.array(courseSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
export type CourseListResponse = z.infer<typeof courseListResponseSchema>;

/** `GET /v1/courses/:id` — the outline a learner browses to pick a lesson: Course -> Levels -> Units -> Lessons, shallow (no Activity/Exercise content — that's `GET /v1/lessons/:id`'s own lazy-loaded payload, §6.2). */
export const courseDetailResponseSchema = courseSchema.extend({
  levels: z.array(
    levelSchema.extend({
      units: z.array(
        unitSchema.extend({
          lessons: z.array(lessonSchema),
        }),
      ),
    }),
  ),
});
export type CourseDetailResponse = z.infer<typeof courseDetailResponseSchema>;

/** `GET /v1/lessons/:id` — the real payload a learner needs to take a lesson: its own Activities, each with its own servable Exercises (public view, no answer key) and Quizzes. */
export const lessonDetailResponseSchema = lessonSchema.extend({
  activities: z.array(
    activityBaseSchema
      .extend({
        exercises: z.array(exercisePublicViewSchema),
        quizzes: z.array(quizSchema),
      })
      .superRefine(refinePersistedActivityContent),
  ),
});
export type LessonDetailResponse = z.infer<typeof lessonDetailResponseSchema>;

/**
 * `GET /v1/reading-activities/matched` (E12 T2, §6.3) — published `READING`
 * activities ordered by how closely their own `content.cefrLevel` matches
 * the caller's own current `READING`-skill `ProficiencyLevel` for
 * `languageId`. `courseId`/`lessonTitle` are included so a learner can tell
 * where a matched passage actually lives, since this list spans lessons —
 * unlike `lessonDetailResponseSchema`'s own single-lesson scope.
 */
export const matchedReadingActivitySchema = activityBaseSchema
  .extend({
    courseId: z.string().uuid(),
    lessonTitle: z.string(),
  })
  .superRefine(refinePersistedActivityContent);
export type MatchedReadingActivity = z.infer<typeof matchedReadingActivitySchema>;

export const matchedReadingActivitiesQuerySchema = z.object({
  languageId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type MatchedReadingActivitiesQuery = z.infer<typeof matchedReadingActivitiesQuerySchema>;

export const matchedReadingActivitiesResponseSchema = z.object({
  data: z.array(matchedReadingActivitySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    matchedCefrLevel: cefrLevelSchema,
  }),
});
export type MatchedReadingActivitiesResponse = z.infer<
  typeof matchedReadingActivitiesResponseSchema
>;

/**
 * `POST /v1/exercises/:id/attempts` request body — `response`'s shape is
 * keyed by the *exercise's own* `type`, looked up server-side, never a
 * client-supplied discriminant (the same scoring-integrity discipline
 * `submitAssessmentResponseValueSchema`, E6 T2, already established).
 * `{ selectedIndex }` for MULTIPLE_CHOICE/LISTENING_COMPREHENSION,
 * `{ text }` for FILL_BLANK/TRANSLATION, `{ matches }` for MATCHING.
 * `SPEAKING_PROMPT` has no response shape here at all — rejected before
 * this union is ever consulted (§1's own scoping boundary: needs
 * `services/speech-service`, not yet built until E10).
 */
export const submitExerciseAttemptResponseValueSchema = z.union([
  z.object({ selectedIndex: z.number().int().min(0) }),
  z.object({ text: z.string().min(1).max(5000) }),
  z.object({
    matches: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })),
  }),
]);
export const submitExerciseAttemptRequestSchema = z.object({
  response: submitExerciseAttemptResponseValueSchema,
});
export type SubmitExerciseAttemptRequest = z.infer<typeof submitExerciseAttemptRequestSchema>;

export const exerciseAttemptResultResponseSchema = z.object({
  id: z.string().uuid(),
  isCorrect: z.boolean(),
  score: z.number().nullable(),
});
export type ExerciseAttemptResultResponse = z.infer<typeof exerciseAttemptResultResponseSchema>;

// --- AI-assisted content drafting (E8 T4, §6.4) — shared between apps/api's admin endpoint and services/ai-engine's own ContentDraftingService/Controller ---

/** `POST /v1/admin/lessons/ai-draft` request body — the raw generation inputs, not attached to any real DB row yet (an admin picks the real Unit to attach the reviewed draft under via the ordinary create endpoints, §6.1). */
export const draftLessonRequestSchema = z.object({
  languageId: z.string().uuid(),
  targetLanguageName: z.string().min(1),
  cefrLevel: cefrLevelSchema,
  topic: z.string().min(1).max(500),
});
export type DraftLessonRequest = z.infer<typeof draftLessonRequestSchema>;

/**
 * The model's own proposed `Exercise` shape — `SPEAKING_PROMPT` is
 * deliberately excluded from the type union entirely (`.exclude(...)`),
 * not just discouraged by prompt instruction: generating a draft exercise
 * type this epic's own submission endpoint (E8 T2) rejects with 422 for
 * every learner, always, would be a real design smell, not a genuine draft.
 * `correctAnswer`'s own shape convention (`{ correctIndex }`/`{ acceptable }`/
 * `{ pairs }`) matches `exercise-scoring.util.ts`'s own expectations exactly
 * — the whole point of a *reviewable* draft is that once an ADMIN approves
 * it unedited, submitting it through T1's real create endpoint must score
 * correctly against real learner attempts later.
 */
export const contentDraftExerciseSchema = z.object({
  type: exerciseTypeSchema.exclude(['SPEAKING_PROMPT']),
  prompt: z.string().min(1),
  correctAnswer: z.record(z.string(), z.unknown()),
});
export type ContentDraftExercise = z.infer<typeof contentDraftExerciseSchema>;

export const contentDraftActivitySchema = z
  .object({
    type: activityTypeSchema,
    title: z.string().min(1),
    content: z.record(z.string(), z.unknown()),
    exercises: z.array(contentDraftExerciseSchema).min(1).max(5),
  })
  .superRefine(refineDraftActivityContent);
export type ContentDraftActivity = z.infer<typeof contentDraftActivitySchema>;

/**
 * `ContentDraftingService.draftLesson()`'s own return shape (E8 T4, §6.4)
 * — a proposal an `ADMIN` reviews, edits as needed, and submits through
 * §6.1's real create endpoints. Never persisted directly by this schema's
 * own consumers; no `id`/timestamps, since nothing has been created yet.
 */
export const contentDraftLessonSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  estimatedMinutes: z.number().int().min(1),
  activities: z.array(contentDraftActivitySchema).min(1).max(3),
});
export type ContentDraftLesson = z.infer<typeof contentDraftLessonSchema>;
