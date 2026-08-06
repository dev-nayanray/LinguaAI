import type { ToolRegistryEntry } from '../tool-registry.types.js';

/** Orchestrator-only per AI_SYSTEM.md §3's table (no "specialist tool" role listed) — see personal-language-teacher.entry.ts's header for the shared reasoning. */
export const writingCoachToolRegistryEntry: ToolRegistryEntry = {
  orchestratorPersona: 'WRITING_COACH',
  version: 'v1',
  allowedTools: [],
};
