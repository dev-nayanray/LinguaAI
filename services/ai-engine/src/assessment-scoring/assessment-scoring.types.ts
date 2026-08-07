/**
 * `AssessmentScoringService.scoreWritingResponse()`'s input (E6 T4, ADR-039).
 * `targetLanguageName`/`prompt` are caller-supplied (`apps/api` already has
 * both from `AssessmentAttempt`/`AssessmentItem`) rather than re-fetched
 * here — this service has no reason to depend on `content.prisma`'s
 * `Language` table for a name string its one caller already knows.
 */
export interface ScoreWritingResponseInput {
  languageId: string;
  targetLanguageName: string;
  /** The `AssessmentItem.prompt` the learner was asked to write about. */
  prompt: string;
  /** The learner's own submitted essay text — untrusted input (ADR-039's own security note). */
  learnerResponse: string;
}
