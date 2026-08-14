// Exams & certification bounded context (ARCHITECTURE.md §2.1, DATABASE.md
// §2.8). First real content (E19 T1, design doc §5/§6.1): ExamProgram/
// MockTestSection admin authoring, learner-facing exam discovery, and the
// fixed-form mock-test-attempt lifecycle. No @linguaai/types/exams module
// exists yet (none of this bounded context's models were ever exposed
// through that package) — this module defines its own canonical shapes
// directly, the same precedent @linguaai/validation/analytics already
// established for a bounded context with no @linguaai/types counterpart.

import { z } from 'zod';
import { skillSchema } from '../learning/index.js';

// --- MockTestSection.content — real, skill-specific shapes (design doc §6.1) ---

const mockTestQuestionSchema = z.object({
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
});
export type MockTestQuestion = z.infer<typeof mockTestQuestionSchema>;

/** Learner-facing view of a question — `correctIndex` never leaves the server before a section is scored (design doc §6.1, mirrors `exercisePublicViewSchema`'s own discipline, E8 T2). */
const mockTestQuestionPublicViewSchema = mockTestQuestionSchema.omit({ correctIndex: true });
export type MockTestQuestionPublicView = z.infer<typeof mockTestQuestionPublicViewSchema>;

export const readingSectionContentSchema = z.object({
  passage: z.string().min(1),
  questions: z.array(mockTestQuestionSchema).min(1),
});
export type ReadingSectionContent = z.infer<typeof readingSectionContentSchema>;

export const listeningSectionContentSchema = z.object({
  audioUrl: z.string().url(),
  transcript: z.string().min(1),
  questions: z.array(mockTestQuestionSchema).min(1),
});
export type ListeningSectionContent = z.infer<typeof listeningSectionContentSchema>;

/** `POST .../sections` request shape for LISTENING — `audioUrl` doesn't exist yet at request time; `apps/api` synthesizes it server-side (design doc §6.1), the same request/persisted asymmetry `draftListeningActivityContentSchema` already established (E12 T1). */
export const draftListeningSectionContentSchema = z.object({
  script: z.string().min(1),
  questions: z.array(mockTestQuestionSchema).min(1),
});
export type DraftListeningSectionContent = z.infer<typeof draftListeningSectionContentSchema>;

export const writingSectionContentSchema = z.object({
  taskPrompt: z.string().min(1),
  minWords: z.number().int().min(1),
});
export type WritingSectionContent = z.infer<typeof writingSectionContentSchema>;

export const speakingSectionContentSchema = z.object({
  prompts: z.array(z.string().min(1)).min(1),
});
export type SpeakingSectionContent = z.infer<typeof speakingSectionContentSchema>;

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

/** Applied to a *real, persisted* `MockTestSection` row being read back (admin view — includes `correctIndex`). */
function refinePersistedSectionContent(
  data: { skill: string; content: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  if (data.skill === 'READING') {
    addNestedContentIssues(readingSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'LISTENING') {
    addNestedContentIssues(listeningSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'WRITING') {
    addNestedContentIssues(writingSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'SPEAKING') {
    addNestedContentIssues(speakingSectionContentSchema.safeParse(data.content), ctx);
  }
}

/** Applied to `createMockTestSectionRequestSchema` only — LISTENING's own real `audioUrl` doesn't exist yet at request time (§ above); every other skill has no such server-side transform. */
function refineCreateSectionContent(
  data: { skill: string; content: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  if (data.skill === 'READING') {
    addNestedContentIssues(readingSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'LISTENING') {
    addNestedContentIssues(draftListeningSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'WRITING') {
    addNestedContentIssues(writingSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'SPEAKING') {
    addNestedContentIssues(speakingSectionContentSchema.safeParse(data.content), ctx);
  }
}

// --- ExamProgram (admin authoring, §5) ---

export const examProgramSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  rubric: z.record(z.string(), z.unknown()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExamProgramResponse = z.infer<typeof examProgramSchema>;

export const createExamProgramRequestSchema = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, 'code must be uppercase alphanumeric/underscore'),
  description: z.string().min(1).optional(),
  rubric: z.record(z.string(), z.unknown()),
});
export type CreateExamProgramRequest = z.infer<typeof createExamProgramRequestSchema>;

export const updateExamProgramRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  rubric: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateExamProgramRequest = z.infer<typeof updateExamProgramRequestSchema>;

// --- MockTestSection (admin authoring, nested under its own program, §5) ---

export const mockTestSectionBaseSchema = z.object({
  id: z.string().uuid(),
  examProgramId: z.string().uuid(),
  skill: skillSchema,
  order: z.number().int(),
  content: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const mockTestSectionSchema = mockTestSectionBaseSchema.superRefine(
  refinePersistedSectionContent,
);
export type MockTestSectionResponse = z.infer<typeof mockTestSectionSchema>;

export const createMockTestSectionRequestSchema = z
  .object({
    skill: skillSchema,
    order: z.number().int().min(0),
    content: z.record(z.string(), z.unknown()),
  })
  .superRefine(refineCreateSectionContent);
export type CreateMockTestSectionRequest = z.infer<typeof createMockTestSectionRequestSchema>;

export const updateMockTestSectionRequestSchema = z.object({
  order: z.number().int().min(0).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateMockTestSectionRequest = z.infer<typeof updateMockTestSectionRequestSchema>;

// --- Learner-facing views (§3.4, §5) ---

/** `correctAnswer`-shaped fields never leave the server before a section is scored — same discipline as `exercisePublicViewSchema` (E8 T2). */
function refinePublicSectionContent(
  data: { skill: string; content: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  if (data.skill === 'READING') {
    addNestedContentIssues(
      readingSectionContentSchema
        .extend({ questions: z.array(mockTestQuestionPublicViewSchema).min(1) })
        .safeParse(data.content),
      ctx,
    );
  } else if (data.skill === 'LISTENING') {
    addNestedContentIssues(
      listeningSectionContentSchema
        .extend({ questions: z.array(mockTestQuestionPublicViewSchema).min(1) })
        .safeParse(data.content),
      ctx,
    );
  } else if (data.skill === 'WRITING') {
    addNestedContentIssues(writingSectionContentSchema.safeParse(data.content), ctx);
  } else if (data.skill === 'SPEAKING') {
    addNestedContentIssues(speakingSectionContentSchema.safeParse(data.content), ctx);
  }
}

export const mockTestSectionPublicViewSchema = mockTestSectionBaseSchema.superRefine(
  refinePublicSectionContent,
);
export type MockTestSectionPublicView = z.infer<typeof mockTestSectionPublicViewSchema>;

export const examProgramListResponseSchema = z.object({
  data: z.array(examProgramSchema.omit({ rubric: true })),
});
export type ExamProgramListResponse = z.infer<typeof examProgramListResponseSchema>;

// --- Mock-test-attempt lifecycle (§3.4, §5) ---

export const mockTestAttemptStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED']);

export const mockTestAttemptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  examProgramId: z.string().uuid(),
  status: mockTestAttemptStatusSchema,
  overallScore: z.number().nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MockTestAttemptResponse = z.infer<typeof mockTestAttemptSchema>;

export const startMockTestAttemptRequestSchema = z.object({
  examProgramId: z.string().uuid(),
});
export type StartMockTestAttemptRequest = z.infer<typeof startMockTestAttemptRequestSchema>;

/** `POST /v1/mock-test-attempts`'s own real response (design doc §3.4) — a fixed-form test serves every section's full public-view content immediately, not one item at a time. */
export const startMockTestAttemptResponseSchema = mockTestAttemptSchema.extend({
  sections: z.array(mockTestSectionPublicViewSchema),
});
export type StartMockTestAttemptResponse = z.infer<typeof startMockTestAttemptResponseSchema>;

// --- Section-response submission & scoring (T2, design doc §6.3/§6.2) ---

/** READING/LISTENING — objectively scored, no AI call. `questionIndex` refers to the section's own `content.questions` array position. */
export const objectiveSectionResponseRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionIndex: z.number().int().min(0),
        selectedIndex: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type ObjectiveSectionResponseRequest = z.infer<typeof objectiveSectionResponseRequestSchema>;

/** WRITING/SPEAKING — RAG-grounded AI band scoring (design doc §6.2). For SPEAKING, `text` is a written transcript of the learner's own spoken response — this epic does not integrate a real live speech-capture session into the mock-test flow (a materially larger, separately-scoped integration, design doc §10); grading a transcript reuses `FluencyScoringService`'s own already-established "read the persisted transcript" precedent (E10 T5). */
export const writtenSectionResponseRequestSchema = z.object({
  text: z.string().min(1).max(10000),
});
export type WrittenSectionResponseRequest = z.infer<typeof writtenSectionResponseRequestSchema>;

export const submitSectionResponseRequestSchema = z.union([
  objectiveSectionResponseRequestSchema,
  writtenSectionResponseRequestSchema,
]);
export type SubmitSectionResponseRequest = z.infer<typeof submitSectionResponseRequestSchema>;

export const mockTestSectionScoreResponseSchema = z.object({
  skill: skillSchema,
  score: z.number().min(0).max(9),
  feedback: z.string().nullable(),
});
export type MockTestSectionScoreResponse = z.infer<typeof mockTestSectionScoreResponseSchema>;

/** `exam.mock_test.completed` (EVENT_ARCHITECTURE.md catalog, E19 T2) — the real payload `MockTestAttemptsService.complete()` publishes. */
export const examMockTestCompletedPayloadSchema = z.object({
  mockTestAttemptId: z.string().uuid(),
  examProgramId: z.string().uuid(),
  overallScore: z.number().min(0).max(9),
});
export type ExamMockTestCompletedPayload = z.infer<typeof examMockTestCompletedPayloadSchema>;

// --- Historical mock-score visibility & Certificate issuance (T3, design doc §3.7/§5) ---

/** `GET /v1/mock-test-attempts` — own, paginated, newest first (PRD.md §7's own named acceptance criterion). */
export const mockTestAttemptListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type MockTestAttemptListQuery = z.infer<typeof mockTestAttemptListQuerySchema>;

export const mockTestAttemptListResponseSchema = z.object({
  data: z.array(mockTestAttemptSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
export type MockTestAttemptListResponse = z.infer<typeof mockTestAttemptListResponseSchema>;

/**
 * `POST .../complete`'s own real response (design doc §3.7) — a real
 * `Certificate` is issued on every completed attempt, regardless of
 * score (a practice score report, not a credential gate). The raw
 * verification token is returned exactly once, here, on the call that
 * actually transitions the attempt to `COMPLETED` — `exams.prisma`'s own
 * header comment establishes the hash-not-raw storage discipline
 * (`PasswordResetToken`/`MfaChallengeToken`'s own precedent), so it can
 * never be recovered later. `null` on an idempotent repeat call (the
 * `Certificate` already exists; there is no raw token left to return).
 */
export const completeMockTestAttemptResponseSchema = mockTestAttemptSchema.extend({
  certificateVerificationToken: z.string().nullable(),
});
export type CompleteMockTestAttemptResponse = z.infer<typeof completeMockTestAttemptResponseSchema>;
