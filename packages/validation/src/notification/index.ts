// Notification bounded context (E16 design doc §4/§5). A real, greenfield
// application layer over `analytics.prisma`'s already-real `NotificationLog`/
// `NotificationPreference` schema (E4 T10) — every schema here is a
// wire-only DTO, the same "no separate `@linguaai/types` restatement"
// precedent `packages/validation/src/commerce/index.ts`'s own header
// comment already established.

import { z } from 'zod';

export const notificationChannelSchema = z.enum(['EMAIL', 'PUSH']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationTypeSchema = z.enum([
  'STREAK_REMINDER',
  'MILESTONE',
  'BILLING_RECEIPT',
  'SECURITY_ALERT',
  'MARKETING',
  'SYSTEM',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * A single row of `GET /v1/notification-preferences`'s own response array
 * (E16 T3, design doc §5). Design doc §3.4 — a user with no real
 * `NotificationPreference` row for a `(channel, type)` pair has never
 * explicitly opted out (`optedIn` defaults to `true`), so the handler that
 * builds this array synthesizes the full default set rather than only
 * returning whatever rows happen to already exist, or the client couldn't
 * distinguish "never set" from "not shown."
 */
export const notificationPreferenceSchema = z.object({
  channel: notificationChannelSchema,
  type: notificationTypeSchema,
  optedIn: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

/** `GET /v1/notification-preferences` response (E16 T3, design doc §5) — a bare array, not a paginated envelope (API_GUIDELINES.md §5's collection envelope is for lists that grow/page; this is a small, complete, bounded set — 2 channels × 6 types at most). */
export const notificationPreferencesResponseSchema = z.array(notificationPreferenceSchema);
export type NotificationPreferencesResponse = z.infer<typeof notificationPreferencesResponseSchema>;

/**
 * `PUT /v1/notification-preferences` request body (E16 T3, design doc §5)
 * — upserts *one* `(channel, type)` row, not a bulk array (the design
 * doc's own §5 wording: "Upserts one preference row"). `SECURITY_ALERT` is
 * a valid enum value here at the schema level (so a malformed request for
 * any other reason still gets a real 400, not a confusing 422) but the
 * controller rejects it at the business-rule layer (422
 * `SEMANTIC_VALIDATION_ERROR`) — `notification-service`'s own
 * `NotificationDispatcher` never checks `NotificationPreference` for this
 * type at all (§3.5's security-critical carve-out), so silently accepting
 * a write here would store a row that looks meaningful but is never
 * actually honored, misleading whatever UI renders this toggle.
 */
export const updateNotificationPreferenceRequestSchema = z.object({
  channel: notificationChannelSchema,
  type: notificationTypeSchema,
  optedIn: z.boolean(),
});
export type UpdateNotificationPreferenceRequest = z.infer<
  typeof updateNotificationPreferenceRequestSchema
>;

/**
 * `notification.preference.changed` domain event payload (E16 T3,
 * EVENT_ARCHITECTURE.md's own catalog) — that catalog row's plain-English
 * payload summary ("userId, channel, enabled") predates this real producer
 * and is non-binding on the exact field list, the same "catalog summaries
 * are historically abbreviated, not exhaustive" precedent
 * `billingEntitlementChangedPayloadSchema`'s own doc comment already
 * established. `type` is included even though the catalog summary omits
 * it — the real uniqueness key is `(userId, channel, type)`, and a
 * consumer with no `type` field could never actually know which
 * preference changed.
 */
export const notificationPreferenceChangedPayloadSchema = z.object({
  userId: z.string().uuid(),
  channel: notificationChannelSchema,
  type: notificationTypeSchema,
  enabled: z.boolean(),
});
export type NotificationPreferenceChangedPayload = z.infer<
  typeof notificationPreferenceChangedPayloadSchema
>;
