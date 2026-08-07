import type { ToolRegistryEntry } from '../tool-registry.types.js';

/**
 * The one persona AI_SYSTEM.md §3's agent table explicitly names as
 * invoking specialist tools: "invokes Grammar/Pronunciation Coach as tools
 * on trigger." Thresholds are provisional placeholders — no production
 * traffic data exists yet to derive them from, same honesty as
 * ADR-034's cost-breaker thresholds and the Orchestrator's own rolling-
 * summary constants (T4).
 */
export const conversationPartnerToolRegistryEntry: ToolRegistryEntry = {
  orchestratorPersona: 'CONVERSATION_PARTNER',
  version: 'v1',
  allowedTools: [
    {
      specialist: 'GRAMMAR_COACH',
      // AI_GOVERNANCE.md §2's own worked example: "a recurring grammar-error
      // pattern crossing a confidence threshold."
      triggerCondition: {
        type: 'error_pattern_threshold',
        confidenceThreshold: 0.7,
        minRecurrenceCount: 3,
      },
    },
    {
      specialist: 'PRONUNCIATION_COACH',
      // Cannot be evaluated for real until speech-service (E10) produces
      // real phoneme-level confidence scores — the condition is registered
      // now so the mechanism is real and testable; the signal that would
      // fire it doesn't exist in this repo yet.
      triggerCondition: { type: 'phoneme_score_threshold', confidenceThreshold: 0.6 },
    },
  ],
};
