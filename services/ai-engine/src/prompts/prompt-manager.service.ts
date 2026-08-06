import { Injectable } from '@nestjs/common';

import { renderTemplate } from './render-template.js';
import { PROMPT_TEMPLATES } from './templates/index.js';
import type { AgentPersona, PromptTemplate } from './prompt-template.types.js';

export interface RenderedSystemPrompt {
  text: string;
  /** Stamped verbatim onto AIMessage.promptVersion/AIUsageLog.promptVersion by the caller (T4/T9) — this service does not write to the database itself. */
  promptVersion: string;
}

/**
 * The versioned prompt template store (AI_SYSTEM.md §2's "Prompt Manager").
 * Templates are code, not database rows — a prompt change ships through
 * the same PR/review/deploy pipeline as any other production behavior
 * change (AI_GOVERNANCE.md §1's lifecycle table), never mutable at
 * runtime. This service only renders and returns the current version; it
 * does not itself write any AIMessage/AIUsageLog row (T4/T9's job).
 */
@Injectable()
export class PromptManagerService {
  private readonly templatesByPersona: ReadonlyMap<AgentPersona, PromptTemplate>;

  constructor() {
    this.templatesByPersona = new Map(PROMPT_TEMPLATES.map((t) => [t.persona, t]));
  }

  getSystemPrompt(
    persona: AgentPersona,
    variables: Record<string, string> = {},
  ): RenderedSystemPrompt {
    const template = this.templatesByPersona.get(persona);
    if (!template) {
      throw new Error(`No prompt template registered for persona "${persona}"`);
    }
    return {
      text: renderTemplate(template.template, variables),
      promptVersion: template.version,
    };
  }
}
