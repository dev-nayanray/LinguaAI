// AI Coaching bounded context (ARCHITECTURE.md §2.1). Two independent
// pieces of real content, landed by separate tasks: the `AIAgentSession`
// wire schemas + `apps/api`<->`ai-engine` contract payloads (E5 T10,
// ADR-033: the `OrchestratorService` `startSession`/`sendMessage`/
// `endSession` contract, REST + SSE), and the `writingCritiqueSchema`
// (E6 T4, ADR-039) Writing-skill AI scoring returns.

import { z } from 'zod';
import { CEFR_LEVELS } from '@linguaai/types/learning';
import {
  AGENT_SESSION_STATUSES,
  ORCHESTRATOR_AGENT_PERSONAS,
  type AIAgentSession,
  type WritingCritique,
} from '@linguaai/types/ai-coaching';

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

export const orchestratorAgentPersonaSchema = z.enum(ORCHESTRATOR_AGENT_PERSONAS);
export const agentSessionStatusSchema = z.enum(AGENT_SESSION_STATUSES);

export const aiAgentSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  languageId: z.string().uuid(),
  orchestratorAgent: orchestratorAgentPersonaSchema,
  status: agentSessionStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<AIAgentSession, z.infer<typeof aiAgentSessionSchema>>();

// --- Endpoint request/response payloads (ADR-033 §6.3) ---

/**
 * `POST /v1/agent-sessions` request body. `userId` is caller-supplied
 * (ai-engine has no auth mechanism of its own — ADR-033's "internal-network-
 * only" security note; the caller, `apps/api`'s own already-authenticated
 * request, is the trust boundary) rather than derived from a token ai-engine
 * would have to verify itself, which would duplicate `apps/api`'s own JWT
 * verification logic for no real gain.
 */
export const startAgentSessionRequestSchema = z.object({
  userId: z.string().uuid(),
  languageId: z.string().uuid(),
  orchestratorAgent: orchestratorAgentPersonaSchema,
});
export type StartAgentSessionRequest = z.infer<typeof startAgentSessionRequestSchema>;

export const startAgentSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
});
export type StartAgentSessionResponse = z.infer<typeof startAgentSessionResponseSchema>;

/**
 * `POST /v1/agent-sessions/:id/end` request body (E10 T2) — extends
 * `startAgentSessionRequestSchema`'s own established "`userId` is caller-
 * supplied, `apps/api`'s own already-authenticated request is the trust
 * boundary" pattern (ADR-033) to session-ending too. Closes a real hole a
 * bare, unauthenticated `sessionId`-only end call would otherwise leave
 * open — any caller able to guess/observe another user's session UUID
 * could end their active session. `OrchestratorService.endSession` 404s
 * (not silently succeeds) on a `userId` mismatch, the same no-existence-
 * leak discipline `AssessmentService.getOwnedAttempt` already established.
 */
export const endAgentSessionRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type EndAgentSessionRequest = z.infer<typeof endAgentSessionRequestSchema>;

/**
 * `POST /v1/agent-sessions/:id/messages` request body.
 * `userMessage`'s 8000-character cap is a flagged, undocumented-elsewhere
 * defensive bound (no doc numerically specifies a max turn length) — large
 * enough for any realistic single conversational turn, small enough to
 * bound worst-case cost/latency for one request. `variables` (persona-
 * template substitutions — OrchestratorService.SendMessageInput.variables)
 * defaults to `{}` rather than being required, since not every persona
 * needs template variables on every turn.
 */
/**
 * `audioUrl` (E10 T4, design doc §6.3 step 3) — the caller's own already-
 * uploaded recording of this turn's spoken input (`speech-service` uploads
 * to object storage *before* calling this endpoint, ADR-047), persisted
 * directly onto the USER `AIMessage` row `prepareGeneration` creates.
 * Optional: a text-only turn (no future UI built yet, E5 T10's own original
 * scope) never has one.
 */
export const sendAgentMessageRequestSchema = z.object({
  userMessage: z.string().min(1).max(8000),
  variables: z.record(z.string()).default({}),
  audioUrl: z.string().url().optional(),
});
export type SendAgentMessageRequest = z.infer<typeof sendAgentMessageRequestSchema>;

/**
 * SSE event payloads — the JSON value of each `data: ...` line
 * (API_GUIDELINES.md §13). A discriminated union on `type` rather than
 * named SSE `event:` fields, so a client only needs one `EventSource`/
 * stream-reader listener and switches on the parsed payload, matching this
 * package's own established discriminated-union convention (e.g.
 * `loginResponseSchema`) rather than inventing a second discrimination
 * mechanism at the transport layer.
 */
export const agentMessageTokenEventSchema = z.object({
  type: z.literal('token'),
  delta: z.string(),
});
export type AgentMessageTokenEvent = z.infer<typeof agentMessageTokenEventSchema>;

/**
 * `messageId` (E10 T4) — the real, persisted assistant `AIMessage.id` this
 * turn's reply was written as. Threaded through so the caller (`speech-service`,
 * T4) can attach that same row's own synthesized-audio URL after TTS
 * completes (`PATCH /v1/agent-sessions/:id/messages/:messageId/audio-url`)
 * — text generation and audio synthesis finish at different times, so the
 * row is written first (here) and its `audioUrl` filled in later, never the
 * reverse.
 */
export const agentMessageDoneEventSchema = z.object({
  type: z.literal('done'),
  messageId: z.string().uuid(),
  assistantMessage: z.string(),
  promptVersion: z.string(),
  modelId: z.string(),
});
export type AgentMessageDoneEvent = z.infer<typeof agentMessageDoneEventSchema>;

/**
 * Emitted only if the stream fails after at least one `token`/before
 * `done` — mirrors RouterService's own "does NOT fail over once a chunk has
 * already reached the caller" limitation: once SSE headers are flushed,
 * the only way to signal a failure is a message within the stream itself,
 * never an HTTP-status change (headers are already sent as 200). A failure
 * *before* the first token is a normal HTTP error response instead (see
 * agent-sessions.controller.ts) — this event only covers the harder,
 * mid-stream case.
 */
export const agentMessageErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});
export type AgentMessageErrorEvent = z.infer<typeof agentMessageErrorEventSchema>;

export const agentMessageStreamEventSchema = z.discriminatedUnion('type', [
  agentMessageTokenEventSchema,
  agentMessageDoneEventSchema,
  agentMessageErrorEventSchema,
]);
export type AgentMessageStreamEvent = z.infer<typeof agentMessageStreamEventSchema>;

/**
 * `PATCH /v1/agent-sessions/:id/messages/:messageId/audio-url` request body
 * (E10 T4, design doc §6.3 step 4) — attaches the assistant's own
 * synthesized-speech URL once TTS finishes, onto the exact `AIMessage` row
 * `agentMessageDoneEventSchema.messageId` already named. `messageId` must
 * belong to the session named in the URL path — `OrchestratorService.updateMessageAudioUrl`
 * 404s otherwise, the same no-existence-leak discipline `endAgentSessionRequestSchema`
 * already established for this controller.
 */
export const updateAgentMessageAudioRequestSchema = z.object({
  audioUrl: z.string().url(),
});
export type UpdateAgentMessageAudioRequest = z.infer<typeof updateAgentMessageAudioRequestSchema>;

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

/**
 * `POST /v1/assessment-scoring/writing` request body (E6 T5, ADR-033's
 * pattern applied to Writing-skill scoring). Shape matches
 * `AssessmentScoringService.scoreWritingResponse()`'s own input exactly —
 * one schema for both the wire contract and the service call, the same
 * "no separate internal type" precedent `startAgentSessionRequestSchema`
 * already set for `OrchestratorService.startSession()`.
 * `learnerResponse`'s 10000-character cap is a flagged, undocumented-
 * elsewhere defensive bound (an essay-length response is realistically
 * longer than a single conversational turn's 8000-char cap
 * (`sendAgentMessageRequestSchema`), but still needs *some* ceiling to
 * bound worst-case cost/latency).
 */
export const scoreWritingRequestSchema = z.object({
  languageId: z.string().uuid(),
  targetLanguageName: z.string().min(1),
  prompt: z.string().min(1),
  learnerResponse: z.string().min(1).max(10000),
});
export type ScoreWritingRequest = z.infer<typeof scoreWritingRequestSchema>;

// --- Session-end fluency scoring (E10 T5, design doc §6.4, ADR-048) ---

/** `FluencyScore.componentScores`'s own real shape (the schema column itself only documents an *example* shape — this is the actual source of truth, per that column's own doc comment). */
export const fluencyScoreComponentScoresSchema = z.object({
  fluency: z.number().min(0).max(100),
  coherence: z.number().min(0).max(100),
  pronunciation: z.number().min(0).max(100),
  grammar: z.number().min(0).max(100),
});
export type FluencyScoreComponentScores = z.infer<typeof fluencyScoreComponentScoresSchema>;

/** A single term `FluencyScoringService` judged notable enough to extract from the transcript — persisted into the learner's own personal dictionary (`source: 'CONVERSATION'`, E9 T2) by the caller, never by `ai-engine` itself (ADR-044's own Postgres-access boundary). */
export const extractedVocabularyItemSchema = z.object({
  term: z.string().min(1),
  translation: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});
export type ExtractedVocabularyItem = z.infer<typeof extractedVocabularyItemSchema>;

/**
 * What the model must return for `FluencyScoringService`'s own structured-
 * output call (E10 T5, ADR-048) — a malformed or schema-violating response
 * is a thrown error, never silently passed through as a guessed score, the
 * same "reproducible scoring" bar `writingCritiqueSchema` already
 * established. Capped at 10 extracted terms per session — a defensive
 * bound against a pathological over-long transcript producing an unbounded
 * vocabulary list, not a claim that 10 is a tuned pedagogical maximum.
 */
export const fluencyScoringModelOutputSchema = z.object({
  overallScore: z.number().min(0).max(100),
  componentScores: fluencyScoreComponentScoresSchema,
  feedback: z.string().min(1),
  vocabulary: z.array(extractedVocabularyItemSchema).max(10),
});
export type FluencyScoringModelOutput = z.infer<typeof fluencyScoringModelOutputSchema>;

/**
 * `POST /v1/fluency-scoring` request body — `sessionId` only.
 * `FluencyScoringService` reads that session's own already-persisted
 * `AIMessage` history directly (`ai-engine` already owns it, ADR-044) —
 * deliberately not a caller-supplied transcript, unlike `scoreWritingRequestSchema`'s
 * own fresh-essay-per-call shape (a session-level score is about existing
 * history, not new content the caller hands over).
 */
export const scoreFluencyRequestSchema = z.object({
  sessionId: z.string().uuid(),
});
export type ScoreFluencyRequest = z.infer<typeof scoreFluencyRequestSchema>;

export const fluencyScoreSchema = z.object({
  overallScore: z.number().min(0).max(100),
  componentScores: fluencyScoreComponentScoresSchema,
  feedback: z.string().min(1),
});
export type FluencyScoreSchema = z.infer<typeof fluencyScoreSchema>;

/**
 * `fluencyScore` is `null` when the session had no real conversational
 * content to score (e.g. a session ended immediately with no assistant
 * turns) — a real, legitimate no-op outcome, not an error condition.
 * `languageId` is included so the caller (`apps/api`'s `SpeakingService`)
 * doesn't need a second round trip just to learn the session's own
 * language before saving extracted vocabulary into the learner's personal
 * dictionary.
 */
export const scoreFluencyResponseSchema = z.object({
  languageId: z.string().uuid(),
  fluencyScore: fluencyScoreSchema.nullable(),
  extractedVocabulary: z.array(extractedVocabularyItemSchema),
});
export type ScoreFluencyResponse = z.infer<typeof scoreFluencyResponseSchema>;

// --- RAG-grounded writing correction (E13 T1, design doc §6.1, ADR-052) ---

/**
 * A single correction `WritingCoachService`'s own structured-output call
 * must return — PRD module 11's own "errors explained, not just flagged"
 * differentiator made real: `explanation` is required, not optional.
 * `ruleReference` is the retrieved `kb:<id>` citation (`citationFor()`,
 * `services/ai-engine/src/rag/format-grounding-context.ts`) when the
 * correction rests on a specific grounded `GRAMMAR_REFERENCE` passage —
 * omitted when the model corrects something general grounding didn't
 * cover (e.g. a typo), the same "cite when a claim rests on a passage,
 * not unconditionally" discipline `writingScoringPromptTemplate` already
 * establishes for `writingCritiqueSchema`.
 */
export const writingCorrectionItemSchema = z.object({
  original: z.string().min(1),
  corrected: z.string().min(1),
  explanation: z.string().min(1),
  ruleReference: z.string().min(1).optional(),
});
export type WritingCorrectionItem = z.infer<typeof writingCorrectionItemSchema>;

/**
 * What the model must return for `WritingCoachService.correctWriting()` —
 * a malformed or schema-violating response is a thrown error, never
 * silently passed through as if valid, the same "reproducible scoring"
 * bar `writingCritiqueSchema`/`fluencyScoringModelOutputSchema` already
 * established. `cefrLevelEstimate` is a real but provisional formative
 * signal, not a certified exam band (E13 design doc §1's own out-of-scope
 * boundary against E19's future exam-scoring epic).
 */
export const writingCorrectionResultSchema = z.object({
  corrections: z.array(writingCorrectionItemSchema),
  overallFeedback: z.string().min(1),
  cefrLevelEstimate: cefrLevelSchema,
});
export type WritingCorrectionResult = z.infer<typeof writingCorrectionResultSchema>;

/**
 * `POST /v1/writing-coaching/correct` request body — ADR-033's internal-
 * trust pattern applied to writing correction, the same stateless,
 * one-shot shape `scoreWritingRequestSchema` already established for
 * placement-test scoring. `text`'s 10000-character cap mirrors
 * `learnerResponse`'s own bound for the identical reason (a real, defensive
 * ceiling on worst-case cost/latency for a free-form submission).
 */
export const correctWritingRequestSchema = z.object({
  languageId: z.string().uuid(),
  targetLanguageName: z.string().min(1),
  text: z.string().min(1).max(10000),
});
export type CorrectWritingRequest = z.infer<typeof correctWritingRequestSchema>;
