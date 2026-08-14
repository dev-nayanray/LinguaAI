// Analytics bounded context (E17 design doc §4/§5). A real, greenfield
// application layer over `analytics.prisma`'s/`assessment.prisma`'s
// already-real `LearningEvent`/`AIUsageLog`/`ProficiencyLevelHistory`
// schema (E4 T10/E6) — every schema here is a wire-only DTO, the same
// "no separate `@linguaai/types` restatement" precedent
// `packages/validation/src/commerce/index.ts`'s own header comment
// already established.

import { z } from 'zod';

/**
 * Shared `from`/`to` query params for every reporting endpoint (E17
 * design doc §5) — both optional; a handler that needs a default window
 * applies its own (e.g. "last 30 days"), since what a sensible default
 * looks like differs per report (a CEFR-progression report reasonably
 * defaults to a much wider window than an AI-cost report).
 */
export const analyticsDateRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AnalyticsDateRangeQuery = z.infer<typeof analyticsDateRangeQuerySchema>;

/** `GET /v1/admin/analytics/cefr-progression` query (E17 T2, design doc §5) — `languageId` required, a progression rate with no language to scope it to isn't a meaningful report. */
export const cefrProgressionQuerySchema = analyticsDateRangeQuerySchema.extend({
  languageId: z.string().uuid(),
});
export type CefrProgressionQuery = z.infer<typeof cefrProgressionQuerySchema>;

export const skillSchema = z.enum([
  'READING',
  'WRITING',
  'LISTENING',
  'SPEAKING',
  'VOCABULARY',
  'GRAMMAR',
]);

/**
 * `GET /v1/admin/analytics/cefr-progression` response (E17 T2) — PRD.md
 * §5.1's own named required deliverable: "re-assessment score deltas over
 * time per user/cohort." A cohort-level report, not a per-user drill-down
 * (this is an internal aggregate metric, not a per-learner audit trail) —
 * for each skill, of the users with at least two recorded
 * `ProficiencyLevelHistory` entries for this language within the queried
 * window, how many advanced at least one real CEFR level between their
 * earliest and latest recorded entry.
 */
export const cefrProgressionBySkillSchema = z.object({
  skill: skillSchema,
  usersWithMultipleRecords: z.number().int().nonnegative(),
  usersAdvanced: z.number().int().nonnegative(),
  /** `usersAdvanced / usersWithMultipleRecords`, or `null` when the denominator is 0 — a real "no data yet" signal, not a misleading 0%. */
  progressionRate: z.number().min(0).max(1).nullable(),
});
export type CefrProgressionBySkill = z.infer<typeof cefrProgressionBySkillSchema>;

export const cefrProgressionResponseSchema = z.object({
  languageId: z.string().uuid(),
  from: z.string().datetime().nullable(),
  to: z.string().datetime().nullable(),
  bySkill: z.array(cefrProgressionBySkillSchema),
});
export type CefrProgressionResponse = z.infer<typeof cefrProgressionResponseSchema>;

/** `GET /v1/admin/analytics/ai-cost` response (E17 T2) — the detail breakdown `overview`'s own single cost-per-active-user figure (T3) rolls up from. */
export const aiCostByDimensionSchema = z.object({
  key: z.string(),
  costUsdMicros: z.number().int().nonnegative(),
  requestCount: z.number().int().nonnegative(),
});
export type AiCostByDimension = z.infer<typeof aiCostByDimensionSchema>;

export const aiCostResponseSchema = z.object({
  from: z.string().datetime().nullable(),
  to: z.string().datetime().nullable(),
  totalCostUsdMicros: z.number().int().nonnegative(),
  totalRequests: z.number().int().nonnegative(),
  byAgentPersona: z.array(aiCostByDimensionSchema),
  byModelId: z.array(aiCostByDimensionSchema),
});
export type AiCostResponse = z.infer<typeof aiCostResponseSchema>;
