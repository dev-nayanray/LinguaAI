import type { OrchestratorAgentPersona } from '@linguaai/database';

/**
 * Only the personas AI_SYSTEM.md §3's own agent table actually describes
 * as a "Specialist tool" (Grammar Coach, Pronunciation Coach — always;
 * Vocabulary Coach — "Specialist tool / Orchestrator for dedicated
 * vocabulary sessions"). Writing Coach and Exam Coach are Orchestrator-only
 * per that same table (no "specialist tool" role listed, no other
 * persona's "Key tools/context" column names them) — not included here.
 * Reusing the local `AgentPersona` union from `prompts/prompt-template.types.ts`
 * would be a wider superset than this registry actually needs.
 */
export type SpecialistPersona = 'GRAMMAR_COACH' | 'PRONUNCIATION_COACH' | 'VOCABULARY_COACH';

/**
 * ADR-032: confidence thresholds + pattern-repetition counts per
 * specialist. A discriminated union, not one shared shape — Grammar
 * Coach's trigger (a recurring error *pattern*, AI_GOVERNANCE.md §2's own
 * worked example) and Pronunciation Coach's (a single phoneme score) are
 * genuinely different signals, not variations on the same parameters.
 */
export type TriggerCondition =
  | { type: 'error_pattern_threshold'; confidenceThreshold: number; minRecurrenceCount: number }
  | { type: 'phoneme_score_threshold'; confidenceThreshold: number };

export interface ToolRegistryEntryTool {
  specialist: SpecialistPersona;
  triggerCondition: TriggerCondition;
}

export interface ToolRegistryEntry {
  orchestratorPersona: OrchestratorAgentPersona;
  /**
   * Bumped whenever `allowedTools` changes in a way that could alter real
   * invocation behavior — a specialist added/removed, or any trigger
   * condition's parameters changed — not for a cosmetic edit (a comment).
   * Same convention as `PromptTemplate.version` (T3,
   * `prompts/prompt-template.types.ts`) — old versions survive in git
   * history, not a separate runtime API.
   */
  version: string;
  allowedTools: ToolRegistryEntryTool[];
}
