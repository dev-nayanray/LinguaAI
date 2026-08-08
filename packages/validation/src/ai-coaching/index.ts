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
export const sendAgentMessageRequestSchema = z.object({
  userMessage: z.string().min(1).max(8000),
  variables: z.record(z.string()).default({}),
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

export const agentMessageDoneEventSchema = z.object({
  type: z.literal('done'),
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
