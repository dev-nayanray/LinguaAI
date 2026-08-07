import type { AgentPersona } from '@linguaai/database';

export interface RecordUsageInput {
  userId?: string;
  agentPersona: AgentPersona;
  modelId: string;
  promptVersion?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface RecordUsageResult {
  costUsdMicros: number;
}
