// AI Coaching bounded context (ARCHITECTURE.md §2.1). First real content
// (E6-T4): the structured critique object Writing-skill AI scoring returns
// (E6 design doc §6.3, ADR-039). `CefrLevel` is a shared, platform-wide
// concept, not context-specific data — reused from `@linguaai/types/learning`
// (that file's own header invites this) rather than redefined here.

import type { CefrLevel } from '../learning/index.js';

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
