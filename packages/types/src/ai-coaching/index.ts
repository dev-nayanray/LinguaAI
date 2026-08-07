// AI Coaching bounded context (ARCHITECTURE.md §2.1). Two independent
// pieces of real content, landed by separate tasks: `AIAgentSession`
// (E5 T10, ADR-033) mirrors packages/database/schema/ai.prisma's
// AIAgentSession field-for-field — scoped to exactly what the
// apps/api<->ai-engine contract needs, not a restatement of every AI
// Coaching entity (AIMemoryEntry, KnowledgeBaseEntry, etc.), which have no
// external wire contract yet and stay internal to services/ai-engine until
// a task actually exposes one. `WritingCritique` (E6 T4, ADR-039) is the
// structured critique object Writing-skill AI scoring returns; `CefrLevel`
// is a shared, platform-wide concept, not context-specific data — reused
// from `@linguaai/types/learning` (that file's own header invites this)
// rather than redefined here.
//
// Timestamps are typed `string` (ISO 8601) — wire/domain types consumed
// across the API boundary, not Prisma's own generated `Date`-typed types.

import type { CefrLevel } from '../learning/index.js';

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

/**
 * `AssessmentScoringService.scoreWritingResponse()`'s return shape
 * (services/ai-engine) — always a schema-validated structured object,
 * never freeform prose (ADR-007's specialist-tool discipline, applied here
 * even though this isn't an Orchestrator-invoked specialist). `feedback`
 * is sanitized (`SafetyLayerService.sanitizeOutput()`) before this type's
 * value ever leaves ai-engine.
 */
export interface WritingCritique {
  cefrLevel: CefrLevel;
  /** The model's own self-assessed confidence, 0–1 — distinct from, and not directly comparable to, the objective skills' §6.4 formula (item-count/consistency inputs that don't exist for a single essay). */
  confidence: number;
  feedback: string;
}
