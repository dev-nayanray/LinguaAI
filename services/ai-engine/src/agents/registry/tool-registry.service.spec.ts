import type { OrchestratorAgentPersona } from '@linguaai/database';

import { TOOL_REGISTRY_ENTRIES } from './entries/index.js';
import { ToolRegistryService } from './tool-registry.service.js';

const ALL_ORCHESTRATOR_PERSONAS: OrchestratorAgentPersona[] = [
  'PERSONAL_LANGUAGE_TEACHER',
  'CONVERSATION_PARTNER',
  'VOCABULARY_COACH',
  'WRITING_COACH',
  'EXAM_COACH',
];

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;

  beforeEach(() => {
    service = new ToolRegistryService();
  });

  it('registers exactly one entry per OrchestratorAgentPersona value — no persona missing, none duplicated', () => {
    const registeredPersonas = TOOL_REGISTRY_ENTRIES.map((e) => e.orchestratorPersona);

    expect(registeredPersonas.sort()).toEqual([...ALL_ORCHESTRATOR_PERSONAS].sort());
    expect(new Set(registeredPersonas).size).toBe(ALL_ORCHESTRATOR_PERSONAS.length);
  });

  it("returns Grammar Coach and Pronunciation Coach as Conversation Partner's allowed tools, per AI_SYSTEM.md §3", () => {
    const tools = service.getAllowedTools('CONVERSATION_PARTNER');

    expect(tools.map((t) => t.specialist).sort()).toEqual(['GRAMMAR_COACH', 'PRONUNCIATION_COACH']);
  });

  it.each([
    'PERSONAL_LANGUAGE_TEACHER',
    'VOCABULARY_COACH',
    'WRITING_COACH',
    'EXAM_COACH',
  ] as const)(
    'returns no allowed tools for %s — structurally ready, no trigger relationship named in AI_SYSTEM.md §3 yet',
    (persona) => {
      expect(service.getAllowedTools(persona)).toEqual([]);
    },
  );

  it('throws a clear error for a persona with no registered entry', () => {
    expect(() => service.getAllowedTools('NOT_A_REAL_PERSONA' as OrchestratorAgentPersona)).toThrow(
      'No tool registry entry for persona "NOT_A_REAL_PERSONA"',
    );
  });
});
