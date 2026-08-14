// Commerce bounded context (ARCHITECTURE.md §2.1, E15 design doc §4/§5).
// A real, greenfield application layer over `billing.prisma`'s own
// already-real schema (E4 T9) — every schema here is a wire-only DTO, the
// same "no separate `@linguaai/types` restatement" precedent
// `pronunciationAttemptResponseSchema`'s own header comment already
// established, since none of these shapes need a compile-time drift
// guard against a canonical interface elsewhere.

import { z } from 'zod';

export const planTierSchema = z.enum(['FREE', 'PREMIUM', 'FAMILY', 'BUSINESS']);
export type PlanTier = z.infer<typeof planTierSchema>;

export const subscriptionStatusSchema = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** `POST /v1/billing/checkout` response (E15 T1, design doc §5). */
export const checkoutSessionResponseSchema = z.object({
  checkoutUrl: z.string().url(),
});
export type CheckoutSessionResponse = z.infer<typeof checkoutSessionResponseSchema>;

/** `GET /v1/billing/me` response (E15 T1, design doc §5) — the caller's own current plan/subscription/entitlement snapshot. */
export const billingStatusResponseSchema = z.object({
  planTier: planTierSchema,
  subscriptionStatus: subscriptionStatusSchema.nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  trialEndsAt: z.string().datetime().nullable(),
  limits: z.record(z.string(), z.unknown()),
  usage: z.record(z.string(), z.unknown()),
});
export type BillingStatusResponse = z.infer<typeof billingStatusResponseSchema>;

/** `billing.subscription.changed` domain event payload (E15 T1, EVENT_ARCHITECTURE.md's own catalog) — a real shape for a row that existed as a placeholder in that catalog since before this epic. */
export const billingSubscriptionChangedPayloadSchema = z.object({
  userId: z.string().uuid(),
  plan: planTierSchema,
  status: subscriptionStatusSchema,
});
export type BillingSubscriptionChangedPayload = z.infer<
  typeof billingSubscriptionChangedPayloadSchema
>;

/** `billing.entitlement.changed` domain event payload (E15 T1, EVENT_ARCHITECTURE.md's own catalog) — `entitlementKey`/`newValue` matches that row's own original placeholder summary; T1's own real producer emits `entitlementKey: 'planTier'` on every plan transition, since T1 replaces the caller's whole `Entitlement.limits` snapshot rather than changing one limit key at a time. */
export const billingEntitlementChangedPayloadSchema = z.object({
  userId: z.string().uuid(),
  entitlementKey: z.string(),
  newValue: z.string(),
});
export type BillingEntitlementChangedPayload = z.infer<
  typeof billingEntitlementChangedPayloadSchema
>;
