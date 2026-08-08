import type { OrchestratorAgentPersona } from '@linguaai/database';

export interface StartSessionInput {
  userId: string;
  languageId: string;
  orchestratorAgent: OrchestratorAgentPersona;
}

export interface StartSessionResult {
  sessionId: string;
}

export interface SendMessageInput {
  sessionId: string;
  userMessage: string;
  /**
   * Persona-template variables (e.g. targetLanguageName, proficiencyLevel)
   * — required on every call rather than cached in-process against the
   * session. Unlike the rolling summary (a pure optimization with a safe,
   * cheap recompute-on-miss fallback), a variables cache has no safe
   * fallback: a miss (process restart, or the request landing on a
   * different replica) would make PromptManagerService.getSystemPrompt()
   * throw instead of degrading gracefully. The caller (eventually T10's
   * apps/api contract) already knows these values on every turn, so
   * requiring them explicitly costs nothing and avoids that failure mode
   * entirely.
   */
  variables: Record<string, string>;
}

export interface SendMessageResult {
  assistantMessage: string;
  promptVersion: string;
  modelId: string;
}

/**
 * `userId` (E10 T2) closes a real hole a bare `sessionId`-only end call
 * would otherwise leave open — `OrchestratorService.endSession` verifies it
 * against the session's own owner and 404s on a mismatch, mirroring
 * `startSession`'s own established "caller-supplied `userId`, `apps/api`'s
 * already-authenticated request is the trust boundary" pattern (ADR-033).
 */
export interface EndSessionInput {
  sessionId: string;
  userId: string;
}

/**
 * `OrchestratorService.streamMessage()`'s yielded events (ADR-033, T10) —
 * `token` deltas as the Router streams them, then exactly one `done` event
 * carrying the same shape `SendMessageResult` already has. No `error`
 * event is modeled here: a mid-stream failure propagates as a thrown
 * error out of the async generator itself (the caller's `for await` loop
 * sees it as a rejected iteration) — the SSE-specific "emit an `error`
 * event instead of changing HTTP status once streaming has begun" concern
 * belongs to the controller that turns this generator into an HTTP
 * response, not to the Orchestrator's own contract.
 */
export type SendMessageStreamEvent =
  { type: 'token'; delta: string } | ({ type: 'done' } & SendMessageResult);
