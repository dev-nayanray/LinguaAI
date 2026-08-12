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

import { fluencyScoreComponentScoresSchema } from '../ai-coaching/index.js';

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

// --- Real-time WebSocket message catalog (T3, API.md §7 / API_GUIDELINES.md
// §9) — the JSON control-message half of the connection between a client
// and `speech-service`'s `/realtime/speaking-sessions/:sessionId` endpoint.
// Binary WebSocket frames (the raw audio chunks themselves) carry no
// envelope/schema of their own — only the JSON control messages below do.
// `type` values are namespaced by domain exactly as API_GUIDELINES.md §9
// specifies. T3 declared `speech.partial-transcript`/`speech.final-transcript`/
// `ack` (server→client) and `speech.end-of-turn` (client→server); T4 adds
// `ai.token`/`ai.done`/`speech.audio-chunk` (server→client, §6.3 steps 3-4)
// — `speech.degraded` (T6) remains that later task's own scope to add, not
// speculatively pre-declared here.

const realtimeMessageFields = {
  sessionId: z.string().uuid(),
  ts: z.number(),
};

/**
 * Client→server: signals that the current turn's audio is complete —
 * `speech-service`'s own signal to stop buffering and run the accumulated
 * audio through `SttProvider.streamTranscribe()` (§6.3 step 1). An empty,
 * `.strict()` payload — this message type carries no data of its own, only
 * the envelope's own `sessionId`/`ts`.
 */
export const speechEndOfTurnClientMessageSchema = z.object({
  type: z.literal('speech.end-of-turn'),
  payload: z.object({}).strict(),
  ...realtimeMessageFields,
});
export type SpeechEndOfTurnClientMessage = z.infer<typeof speechEndOfTurnClientMessageSchema>;

/**
 * Server→client: acknowledges one received binary audio chunk
 * (API_GUIDELINES.md §9 — "every client-sent chunk gets a server
 * acknowledgment... so the client can detect and resend on a dropped ack
 * within a defined timeout"). `forSeq` is the server-assigned, per-
 * connection, arrival-order sequence number (WebSocket-over-TCP already
 * guarantees ordered delivery, so the server assigning it — rather than
 * requiring the client to stamp every binary frame with an explicit
 * counter — is a real, deliberate simplification with no correctness cost).
 */
export const ackServerMessageSchema = z.object({
  type: z.literal('ack'),
  payload: z.object({ forSeq: z.number().int().nonnegative() }),
  ...realtimeMessageFields,
});
export type AckServerMessage = z.infer<typeof ackServerMessageSchema>;

/**
 * Server→client: a partial or final transcript for the current turn (§6.3
 * step 2). `text` is always the *full* text accumulated so far, never an
 * incremental delta — mirroring `TranscriptChunk.text`'s own documented
 * shape (`services/speech-service/src/speech-provider/speech-provider.interface.ts`).
 */
export const speechTranscriptServerMessageSchema = z.object({
  type: z.enum(['speech.partial-transcript', 'speech.final-transcript']),
  payload: z.object({ text: z.string() }),
  ...realtimeMessageFields,
});
export type SpeechTranscriptServerMessage = z.infer<typeof speechTranscriptServerMessageSchema>;

/**
 * Server→client: a live token delta of the assistant's own reply (T4,
 * §6.3 step 3) — relayed immediately as `ai-engine`'s own SSE `token`
 * events arrive, the same "streamed, never buffered-then-sent-whole"
 * discipline §6.3 step 5 states explicitly.
 */
export const aiTokenServerMessageSchema = z.object({
  type: z.literal('ai.token'),
  payload: z.object({ delta: z.string() }),
  ...realtimeMessageFields,
});
export type AiTokenServerMessage = z.infer<typeof aiTokenServerMessageSchema>;

/**
 * Server→client: the assistant's complete reply text, once `ai-engine`'s
 * own SSE stream reaches its `done` event (T4). The underlying `AIMessage.id`
 * (`agentMessageDoneEventSchema.messageId`) is deliberately *not* included
 * here — internal DB-id bookkeeping `SpeechSessionConnection` keeps to
 * itself for the later `speech.audio-chunk`/audioUrl-attach step, never a
 * client-facing concern.
 */
export const aiDoneServerMessageSchema = z.object({
  type: z.literal('ai.done'),
  payload: z.object({ text: z.string() }),
  ...realtimeMessageFields,
});
export type AiDoneServerMessage = z.infer<typeof aiDoneServerMessageSchema>;

/**
 * Server→client: one chunk of synthesized assistant speech (T4, §6.3 step
 * 4) — base64-encoded, unlike client-sent audio's own raw binary frames
 * (T3). Client audio-in is many small, frequent, latency-sensitive
 * microphone chunks (binary frames avoid both base64's ~33% overhead and a
 * second parse path); assistant audio-out is comparatively coarse
 * (per-sentence, T4's own `SentenceChunker`), so staying inside the one
 * uniform JSON envelope every other server→client message already uses
 * outweighs that overhead here. `done: true` marks the *whole turn's*
 * synthesized audio as complete (every sentence flushed, `audio: ''`) —
 * not `TtsProvider.streamSynthesize()`'s own per-call `AudioChunk.done`,
 * which only marks one sentence's own synthesis call as finished.
 */
export const speechAudioChunkServerMessageSchema = z.object({
  type: z.literal('speech.audio-chunk'),
  payload: z.object({ audio: z.string(), done: z.boolean() }),
  ...realtimeMessageFields,
});
export type SpeechAudioChunkServerMessage = z.infer<typeof speechAudioChunkServerMessageSchema>;

/**
 * `speech.session.ended`'s real payload (E10 T5, design doc §6.4) —
 * refines `EVENT_ARCHITECTURE.md`'s own pre-existing placeholder row for
 * this event (found already cataloged, producer `services/speech-service`,
 * payload `userId, durationSec, fluencyScore` — never implemented by any
 * task through E1-E9), the same "real shape landed, refining this row's
 * own placeholder summary" precedent `assessment.attempt.completed`/
 * `learning.lesson.completed` already established, rather than inventing a
 * second, redundant event name for the same real-world occurrence. Producer
 * corrected to `apps/api` (Speaking module) — the actual owner of
 * `DomainEventPublisher`/`PersonalDictionaryService`, neither of which
 * `services/speech-service` has access to (ADR-044). `overallScore`/
 * `componentScores` is `null` when the session had no real conversational
 * content to score (`FluencyScoringService`'s own legitimate no-op case).
 */
export const speakingSessionEndedPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  languageId: z.string().uuid(),
  overallScore: z.number().min(0).max(100).nullable(),
  componentScores: fluencyScoreComponentScoresSchema.nullable(),
  vocabularyExtractedCount: z.number().int().nonnegative(),
});
export type SpeakingSessionEndedPayload = z.infer<typeof speakingSessionEndedPayloadSchema>;
