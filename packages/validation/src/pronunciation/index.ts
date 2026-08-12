// Pronunciation Lab bounded context (ARCHITECTURE.md §2.1, E11 design doc
// §6). Two wire surfaces share this file: `speech-service`'s own internal,
// stateless scoring endpoint (`scorePronunciationRequestSchema`/
// `pronunciationScoreResultSchema`), and `apps/api`'s learner-facing
// attempt endpoint (`createPronunciationAttemptRequestSchema`/
// `pronunciationAttemptResponseSchema`) — the same "no separate
// `@linguaai/types` restatement for a wire-only DTO" precedent
// `speaking/index.ts` already established, since neither surface has a
// corresponding persisted-entity type elsewhere.

import { z } from 'zod';

export const wordErrorTypeSchema = z.enum(['NONE', 'MISPRONUNCIATION', 'OMISSION', 'INSERTION']);
export type WordErrorType = z.infer<typeof wordErrorTypeSchema>;

export const phonemeScoreSchema = z.object({
  phoneme: z.string().min(1),
  accuracyScore: z.number().min(0).max(100),
});
export type PhonemeScore = z.infer<typeof phonemeScoreSchema>;

export const wordScoreSchema = z.object({
  word: z.string().min(1),
  accuracyScore: z.number().min(0).max(100),
  errorType: wordErrorTypeSchema,
  phonemes: z.array(phonemeScoreSchema),
});
export type WordScore = z.infer<typeof wordScoreSchema>;

/**
 * `speech-service`'s own `POST /v1/pronunciation/score` result shape
 * (E11 §6.1/§6.2) — the real `PronunciationScoreResult` a
 * `PronunciationProvider` produces, echoed back verbatim over the wire.
 */
export const pronunciationScoreResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  accuracyScore: z.number().min(0).max(100),
  fluencyScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  words: z.array(wordScoreSchema),
});
export type PronunciationScoreResult = z.infer<typeof pronunciationScoreResultSchema>;

/**
 * `speech-service`'s own internal request body — `audio` base64-encoded
 * (a single bounded recorded utterance, small enough to need no
 * chunked/streaming upload, E11 §6.2's own deliberate simplification over
 * E10's real-time WebSocket transport).
 */
export const scorePronunciationRequestSchema = z.object({
  audio: z.string().min(1),
  referenceText: z.string().min(1).max(500),
  languageCode: z.string().min(2),
});
export type ScorePronunciationRequest = z.infer<typeof scorePronunciationRequestSchema>;

/**
 * `apps/api`'s own learner-facing `POST /v1/pronunciation-attempts`
 * request body (E11 §6.2/§6.3) — `languageId` resolves to the real
 * `Language` row `PronunciationLabAttempt.languageId` references;
 * `apps/api` itself derives the BCP-47 `languageCode` `speech-service`
 * needs from it, never client-supplied directly.
 */
export const createPronunciationAttemptRequestSchema = z.object({
  languageId: z.string().uuid(),
  targetPhrase: z.string().min(1).max(500),
  audio: z.string().min(1),
});
export type CreatePronunciationAttemptRequest = z.infer<
  typeof createPronunciationAttemptRequestSchema
>;

export const pronunciationAttemptResponseSchema = z.object({
  attemptId: z.string().uuid(),
  languageId: z.string().uuid(),
  targetPhrase: z.string(),
  score: pronunciationScoreResultSchema,
  createdAt: z.string(),
});
export type PronunciationAttemptResponse = z.infer<typeof pronunciationAttemptResponseSchema>;

/**
 * `pronunciation.attempt.scored`'s real payload (E11 §6.5) — mirrors
 * `speaking/index.ts`'s own `speakingSessionEndedPayloadSchema` precedent
 * (a new domain event, real shape defined alongside its own first
 * producer, not a placeholder).
 */
export const pronunciationAttemptScoredPayloadSchema = z.object({
  attemptId: z.string().uuid(),
  languageId: z.string().uuid(),
  overallScore: z.number().min(0).max(100),
  accuracyScore: z.number().min(0).max(100),
  fluencyScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
});
export type PronunciationAttemptScoredPayload = z.infer<
  typeof pronunciationAttemptScoredPayloadSchema
>;
