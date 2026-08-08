// Speaking Practice & Speech Pipeline bounded context (ARCHITECTURE.md §2.1,
// E10 design doc §6.2). No new persisted domain entity is modeled here — a
// "speaking session" *is* an `AIAgentSession` with
// `orchestratorAgent: CONVERSATION_PARTNER` (already typed in
// @linguaai/types/ai-coaching, ADR-033), never a separate table. These
// schemas are wire-only DTOs for `apps/api`'s new `SpeakingModule` (T2),
// the same "no separate internal type" precedent
// `sendAgentMessageRequestSchema`/`scoreWritingRequestSchema` already set
// for endpoint payloads with no corresponding @linguaai/types restatement.

import { z } from 'zod';

/**
 * `POST /v1/speaking-sessions` request body (T2, design doc §6.2,
 * ADR-043). `orchestratorAgent` is never client-supplied — always hardcoded
 * server-side to `CONVERSATION_PARTNER` (`SpeakingService.startSession`),
 * the same "no application code lets a client pick its own persona"
 * discipline this platform's every other single-persona entry point
 * already follows (ADR-007's single-voice invariant).
 */
export const startSpeakingSessionRequestSchema = z.object({
  languageId: z.string().uuid(),
});
export type StartSpeakingSessionRequest = z.infer<typeof startSpeakingSessionRequestSchema>;

/**
 * `sessionId` is the real, newly-created `AIAgentSession.id` (ai-engine's
 * own `POST /v1/agent-sessions`, ADR-033). `token`/`expiresInSeconds` are
 * the short-lived internal-token handoff (design doc §6.2, ADR-043) the
 * client presents at `speech-service`'s own WebSocket handshake (T3) —
 * verified there with zero network round-trip (`verifySpeechSessionToken`,
 * `@linguaai/utils`, T1).
 */
export const startSpeakingSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});
export type StartSpeakingSessionResponse = z.infer<typeof startSpeakingSessionResponseSchema>;
