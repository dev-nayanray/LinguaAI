// Gamification bounded context (ARCHITECTURE.md §2.1, E14 design doc §4).
// A real, greenfield application layer over `gamification.prisma`'s own
// already-real schema (E4 T6) — every schema here is a wire-only DTO, the
// same "no separate `@linguaai/types` restatement" precedent
// `pronunciationAttemptResponseSchema`'s own header comment already
// established, since none of these shapes need a compile-time drift
// guard against a canonical interface elsewhere.

import { z } from 'zod';

export const missionTypeSchema = z.enum(['DAILY', 'WEEKLY', 'SPECIAL_EVENT']);
export type MissionType = z.infer<typeof missionTypeSchema>;

export const missionMetricSchema = z.enum([
  'XP_EARNED',
  'LESSONS_COMPLETED',
  'MINUTES_STUDIED',
  'STREAK_DAYS',
]);
export type MissionMetric = z.infer<typeof missionMetricSchema>;

/** `GET /v1/gamification/me` response — the caller's own current XP/level/streak (E14 T1, §6). */
export const gamificationStatusResponseSchema = z.object({
  totalXp: z.number().int().min(0),
  level: z.number().int().min(1),
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
});
export type GamificationStatusResponse = z.infer<typeof gamificationStatusResponseSchema>;

/** `gamification.xp.awarded` domain event payload (E14 T1, EVENT_ARCHITECTURE.md's own catalog) — a real shape for a row that existed as a placeholder in that catalog since before this epic. */
export const gamificationXpAwardedPayloadSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().min(1),
  reason: z.enum(['EXERCISE_ANSWERED', 'LESSON_COMPLETED', 'MISSION_COMPLETED', 'BADGE_EARNED']),
});
export type GamificationXpAwardedPayload = z.infer<typeof gamificationXpAwardedPayloadSchema>;

/** `gamification.streak.updated` domain event payload (E14 T1, EVENT_ARCHITECTURE.md's own catalog). `atRisk` is deliberately always `false` today — this epic's own real streak logic (§6.2) only ever increments or resets on real activity; a genuine "about to lose your streak" prediction would require a scheduled job inspecting inactive streaks, out of this task's own scope (§10). */
export const gamificationStreakUpdatedPayloadSchema = z.object({
  userId: z.string().uuid(),
  streakLength: z.number().int().min(0),
  atRisk: z.boolean(),
});
export type GamificationStreakUpdatedPayload = z.infer<
  typeof gamificationStreakUpdatedPayloadSchema
>;

/** `gamification.badge.awarded` domain event payload (E14 T2, EVENT_ARCHITECTURE.md's own catalog). */
export const gamificationBadgeAwardedPayloadSchema = z.object({
  userId: z.string().uuid(),
  badgeId: z.string().uuid(),
});
export type GamificationBadgeAwardedPayload = z.infer<typeof gamificationBadgeAwardedPayloadSchema>;

/** `GET /v1/gamification/badges` response entry (E14 T2). */
export const earnedBadgeResponseSchema = z.object({
  badgeId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  iconUrl: z.string().nullable(),
  earnedAt: z.string().datetime(),
});
export type EarnedBadgeResponse = z.infer<typeof earnedBadgeResponseSchema>;

/** `GET /v1/gamification/missions` response entry (E14 T2) — the caller's own active missions and real progress toward each. */
export const missionProgressResponseSchema = z.object({
  missionId: z.string().uuid(),
  type: missionTypeSchema,
  metric: missionMetricSchema,
  targetValue: z.number().int().min(1),
  progress: z.number().int().min(0),
  rewardXp: z.number().int().min(0),
  completedAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime(),
});
export type MissionProgressResponse = z.infer<typeof missionProgressResponseSchema>;
