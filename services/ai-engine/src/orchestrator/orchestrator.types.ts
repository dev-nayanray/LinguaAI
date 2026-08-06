import type { OrchestratorAgentPersona } from '@linguaai/database';

export interface StartSessionInput {
  userId: string;
  languageId: string;
  orchestratorAgent: OrchestratorAgentPersona;
}

export interface StartSessionResult {
  sessionId: string;
}

export interface SendMessageInput {
  sessionId: string;
  userMessage: string;
  /**
   * Persona-template variables (e.g. targetLanguageName, proficiencyLevel)
   * — required on every call rather than cached in-process against the
   * session. Unlike the rolling summary (a pure optimization with a safe,
   * cheap recompute-on-miss fallback), a variables cache has no safe
   * fallback: a miss (process restart, or the request landing on a
   * different replica) would make PromptManagerService.getSystemPrompt()
   * throw instead of degrading gracefully. The caller (eventually T10's
   * apps/api contract) already knows these values on every turn, so
   * requiring them explicitly costs nothing and avoids that failure mode
   * entirely.
   */
  variables: Record<string, string>;
}

export interface SendMessageResult {
  assistantMessage: string;
  promptVersion: string;
  modelId: string;
}

export interface EndSessionInput {
  sessionId: string;
}
