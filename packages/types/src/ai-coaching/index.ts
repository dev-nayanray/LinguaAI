// AI Coaching bounded context (ARCHITECTURE.md §2.1). Mirrors
// packages/database/schema/ai.prisma's AIAgentSession field-for-field, the
// same "domain types live in packages/types, subpathed by domain"
// convention identity/index.ts documents. Scoped to exactly what E5 T10's
// apps/api<->ai-engine contract needs (ADR-033) — not a restatement of
// every AI Coaching entity (AIMemoryEntry, KnowledgeBaseEntry, etc.), which
// have no external wire contract yet and stay internal to
// services/ai-engine until a task actually exposes one.
//
// Timestamps are typed `string` (ISO 8601) — wire/domain types consumed
// across the API boundary, not Prisma's own generated `Date`-typed types.

export const ORCHESTRATOR_AGENT_PERSONAS = [
  'PERSONAL_LANGUAGE_TEACHER',
  'CONVERSATION_PARTNER',
  'VOCABULARY_COACH',
  'WRITING_COACH',
  'EXAM_COACH',
] as const;
export type OrchestratorAgentPersona = (typeof ORCHESTRATOR_AGENT_PERSONAS)[number];

export const AGENT_SESSION_STATUSES = ['ACTIVE', 'ENDED', 'ABANDONED'] as const;
export type AgentSessionStatus = (typeof AGENT_SESSION_STATUSES)[number];

export interface AIAgentSession {
  id: string;
  userId: string;
  languageId: string;
  orchestratorAgent: OrchestratorAgentPersona;
  status: AgentSessionStatus;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
