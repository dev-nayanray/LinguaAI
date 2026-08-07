/**
 * The full seven-persona superset (matches `AgentPersona` in
 * packages/database/schema/analytics.prisma) — every persona that can
 * incur a real model-call cost, not just the five capable of holding the
 * Orchestrator role (`OrchestratorAgentPersona` in ai.prisma). Kept as its
 * own local union rather than importing `@linguaai/database` — T3 has no
 * other reason to depend on the Prisma client, and pulling it in for a
 * type-only string union would be scope creep ahead of T4, which is the
 * task that actually writes `AIMessage`/`AIUsageLog` rows.
 */
export type AgentPersona =
  | 'PERSONAL_LANGUAGE_TEACHER'
  | 'CONVERSATION_PARTNER'
  | 'GRAMMAR_COACH'
  | 'PRONUNCIATION_COACH'
  | 'VOCABULARY_COACH'
  | 'WRITING_COACH'
  | 'EXAM_COACH';

export interface PromptTemplate {
  readonly persona: AgentPersona;
  /**
   * Bumped whenever an edit could change model behavior — wording,
   * instructions, examples, variable set. A purely cosmetic edit (a
   * comment, whitespace) does not require a bump. Stamped verbatim onto
   * `AIMessage.promptVersion`/`AIUsageLog.promptVersion` (T4/T9) so a
   * quality regression traces back to an exact template version, per
   * AI_GOVERNANCE.md §1. Old versions are not deleted from this file's
   * git history — that history *is* the retention record AI_GOVERNANCE.md
   * §1's "Deprecation" stage requires, not a separate runtime API this
   * task builds.
   */
  readonly version: string;
  readonly template: string;
}
