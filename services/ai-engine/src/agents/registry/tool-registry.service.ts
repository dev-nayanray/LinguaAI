import { Injectable } from '@nestjs/common';
import type { OrchestratorAgentPersona } from '@linguaai/database';

import { TOOL_REGISTRY_ENTRIES } from './entries/index.js';
import type { ToolRegistryEntryTool } from './tool-registry.types.js';

/**
 * AI_GOVERNANCE.md §6's "bounded tool surface" mechanism, made real: every
 * tool an Orchestrator persona may invoke is explicitly declared here, per
 * persona, in a versioned registry — never inferred at runtime or left to
 * a specialist's own discretion.
 */
@Injectable()
export class ToolRegistryService {
  private readonly entriesByPersona = new Map(
    TOOL_REGISTRY_ENTRIES.map((entry) => [entry.orchestratorPersona, entry]),
  );

  getAllowedTools(persona: OrchestratorAgentPersona): ToolRegistryEntryTool[] {
    const entry = this.entriesByPersona.get(persona);
    if (!entry) {
      throw new Error(`No tool registry entry for persona "${persona}"`);
    }
    return entry.allowedTools;
  }
}
