import { PromptManagerService } from './prompt-manager.service.js';
import type { AgentPersona } from './prompt-template.types.js';
import { PROMPT_TEMPLATES } from './templates/index.js';

/** Every value AgentPersona can take — matches AgentPersona in packages/database/schema/analytics.prisma (T4/T9's actual write path). */
const ALL_PERSONAS: AgentPersona[] = [
  'PERSONAL_LANGUAGE_TEACHER',
  'CONVERSATION_PARTNER',
  'GRAMMAR_COACH',
  'PRONUNCIATION_COACH',
  'VOCABULARY_COACH',
  'WRITING_COACH',
  'EXAM_COACH',
];

const ORCHESTRATOR_CAPABLE_VARIABLES = { targetLanguageName: 'Spanish', proficiencyLevel: 'B1' };
const SPECIALIST_ONLY_VARIABLES = {
  targetLanguageName: 'Spanish',
  learnerUtterance: 'Yo tiene un gato.',
};

const VARIABLES_BY_PERSONA: Record<AgentPersona, Record<string, string>> = {
  PERSONAL_LANGUAGE_TEACHER: ORCHESTRATOR_CAPABLE_VARIABLES,
  CONVERSATION_PARTNER: ORCHESTRATOR_CAPABLE_VARIABLES,
  VOCABULARY_COACH: ORCHESTRATOR_CAPABLE_VARIABLES,
  WRITING_COACH: ORCHESTRATOR_CAPABLE_VARIABLES,
  EXAM_COACH: ORCHESTRATOR_CAPABLE_VARIABLES,
  GRAMMAR_COACH: SPECIALIST_ONLY_VARIABLES,
  PRONUNCIATION_COACH: SPECIALIST_ONLY_VARIABLES,
};

describe('PromptManagerService', () => {
  let service: PromptManagerService;

  beforeEach(() => {
    service = new PromptManagerService();
  });

  it('registers exactly one template per AgentPersona value — no persona missing, none duplicated', () => {
    const registeredPersonas = PROMPT_TEMPLATES.map((t) => t.persona);

    expect(registeredPersonas.sort()).toEqual([...ALL_PERSONAS].sort());
    expect(new Set(registeredPersonas).size).toBe(ALL_PERSONAS.length);
  });

  it.each(ALL_PERSONAS)(
    'renders a real system prompt for %s with no leftover placeholders',
    (persona) => {
      const result = service.getSystemPrompt(persona, VARIABLES_BY_PERSONA[persona]);

      expect(result.text).not.toMatch(/\{\{\w+\}\}/);
      expect(result.text.length).toBeGreaterThan(0);
    },
  );

  it('returns the exact version string declared on the persona template, as promptVersion', () => {
    const result = service.getSystemPrompt('CONVERSATION_PARTNER', ORCHESTRATOR_CAPABLE_VARIABLES);
    const template = PROMPT_TEMPLATES.find((t) => t.persona === 'CONVERSATION_PARTNER')!;

    expect(result.promptVersion).toBe(template.version);
  });

  it('throws a clear error for a persona with no registered template', () => {
    expect(() => service.getSystemPrompt('NOT_A_REAL_PERSONA' as AgentPersona, {})).toThrow(
      'No prompt template registered for persona "NOT_A_REAL_PERSONA"',
    );
  });

  it("propagates renderTemplate's own error when a required variable is missing", () => {
    expect(() => service.getSystemPrompt('CONVERSATION_PARTNER', {})).toThrow(
      /Prompt template references undefined variable/,
    );
  });

  it('defaults to an empty variable set when none is supplied', () => {
    expect(() => service.getSystemPrompt('CONVERSATION_PARTNER')).toThrow(
      /Prompt template references undefined variable/,
    );
  });
});
