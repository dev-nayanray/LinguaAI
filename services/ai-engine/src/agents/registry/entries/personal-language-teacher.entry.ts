import type { ToolRegistryEntry } from '../tool-registry.types.js';

/**
 * AI_SYSTEM.md §3's agent table lists Personal Language Teacher's "Key
 * tools/context" as `LearningPlan`, `ProficiencyLevel`, memory only — no
 * specialist tool invocation is named for this persona anywhere in that
 * table. Structurally ready (this entry exists, per E5 §1's own framing)
 * but deliberately empty rather than inventing a trigger relationship the
 * source document doesn't state — a real gap for E6 to fill if/when it
 * decides this persona should invoke a specialist too.
 */
export const personalLanguageTeacherToolRegistryEntry: ToolRegistryEntry = {
  orchestratorPersona: 'PERSONAL_LANGUAGE_TEACHER',
  version: 'v1',
  allowedTools: [],
};
