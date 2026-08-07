import type { ToolRegistryEntry } from '../tool-registry.types.js';

/**
 * This entry is for Vocabulary Coach acting *as Orchestrator* (its
 * "Orchestrator for dedicated vocabulary sessions" role, AI_SYSTEM.md
 * §3) — not its other role, a specialist tool invoked by a *different*
 * orchestrator (that relationship belongs on the inviting persona's own
 * entry; only conversation-partner.entry.ts names it today). As its own
 * Orchestrator, the table names no further specialist it invokes —
 * structurally ready, deliberately empty, same reasoning as
 * personal-language-teacher.entry.ts.
 */
export const vocabularyCoachToolRegistryEntry: ToolRegistryEntry = {
  orchestratorPersona: 'VOCABULARY_COACH',
  version: 'v1',
  allowedTools: [],
};
