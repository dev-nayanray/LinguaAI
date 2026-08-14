import { z } from 'zod';

import {
  AUDIT_ACTOR_TYPES,
  CONSENT_TYPES,
  DEVICE_PLATFORMS,
  ENTITLEMENT_ACTIONS,
  GOAL_TYPES,
  OAUTH_PROVIDERS,
  ORG_ROLES,
  ROLE_CHANGE_STATUSES,
  ROLES,
  USER_STATUSES,
  type AuditLog,
  type ConsentRecord,
  type DeviceToken,
  type EntitlementChangeLog,
  type OAuthAccount,
  type Organization,
  type OrganizationMembership,
  type PasswordResetToken,
  type RefreshToken,
  type RoleChangeRequest,
  type Session,
  type User,
  type UserProfile,
} from '@linguaai/types/identity';

/**
 * Full backend-truth schemas mirroring docs/epics/E2-identity-access-platform.md
 * Part 5 field-for-field — the "single definition consumed by both the
 * NestJS request pipe and the frontend form" CODING_STANDARDS.md §1
 * describes. Endpoint-specific request/response payloads (Part 6) are
 * composed from these via `.pick()`/`.omit()` by whichever task
 * implements that endpoint (E2-T8+) — not enumerated here, to keep this
 * foundational layer scoped to the entities themselves.
 *
 * `assertExtends` is a compile-time-only drift guard: the generic
 * constraint fails to compile if a schema's inferred shape stops matching
 * its canonical @linguaai/types/identity interface. The call itself is a
 * genuine no-op at runtime — this exists purely so `tsc` catches drift
 * between the two packages, not to be invoked for any effect.
 */
function assertExtends<Expected, Actual extends Expected>(_witness?: Actual): void {
  // no-op — see doc comment above; `Actual` is referenced in `_witness`'s
  // type so it isn't flagged as an unused type parameter.
}

export const roleSchema = z.enum(ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS);
export const goalTypeSchema = z.enum(GOAL_TYPES);
export const orgRoleSchema = z.enum(ORG_ROLES);
export const consentTypeSchema = z.enum(CONSENT_TYPES);
export const devicePlatformSchema = z.enum(DEVICE_PLATFORMS);
export const roleChangeStatusSchema = z.enum(ROLE_CHANGE_STATUSES);
export const auditActorTypeSchema = z.enum(AUDIT_ACTOR_TYPES);
export const entitlementActionSchema = z.enum(ENTITLEMENT_ACTIONS);

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  passwordHash: z.string().nullable(),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  locale: z.string().min(1),
  timezone: z.string().min(1),
  role: roleSchema,
  status: userStatusSchema,
  mfaEnrolled: z.boolean(),
  mfaSecret: z.string().nullable(),
  organizationId: z.string().uuid().nullable(),
  tokensValidAfter: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<User, z.infer<typeof userSchema>>();

export const oauthAccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: oauthProviderSchema,
  providerAccountId: z.string().min(1),
  linkedAt: z.string().datetime(),
});
assertExtends<OAuthAccount, z.infer<typeof oauthAccountSchema>>();

export const userProfileSchema = z.object({
  userId: z.string().uuid(),
  nativeLanguage: z.string().min(1),
  targetLanguages: z.array(z.string().min(1)),
  goalType: goalTypeSchema,
  dailyTimeCommitmentMinutes: z.number().int().positive().nullable(),
});
assertExtends<UserProfile, z.infer<typeof userProfileSchema>>();

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  dataRegion: z.string().nullable(),
  seatCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
assertExtends<Organization, z.infer<typeof organizationSchema>>();

export const organizationMembershipSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  orgRole: orgRoleSchema,
});
assertExtends<OrganizationMembership, z.infer<typeof organizationMembershipSchema>>();

export const sessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  deviceLabel: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});
assertExtends<Session, z.infer<typeof sessionSchema>>();

export const refreshTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string().min(1),
  sessionId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  rotatedFromId: z.string().uuid().nullable(),
  revokedAt: z.string().datetime().nullable(),
});
assertExtends<RefreshToken, z.infer<typeof refreshTokenSchema>>();

export const consentRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  consentType: consentTypeSchema,
  policyVersion: z.string().min(1),
  grantedAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().nullable(),
});
assertExtends<ConsentRecord, z.infer<typeof consentRecordSchema>>();

export const deviceTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  platform: devicePlatformSchema,
  token: z.string().min(1),
  active: z.boolean(),
});
assertExtends<DeviceToken, z.infer<typeof deviceTokenSchema>>();

/**
 * `POST /v1/notifications/device-tokens` (E21 T4) — `token` is `@unique`
 * on `DeviceToken` (this same migration), so this is a real upsert: a
 * device re-registering an already-known token (app reinstall re-issuing
 * the same FCM token) reactivates that row rather than creating a
 * duplicate.
 */
export const registerDeviceTokenRequestSchema = z.object({
  platform: devicePlatformSchema,
  token: z.string().min(1),
});
export type RegisterDeviceTokenRequest = z.infer<typeof registerDeviceTokenRequestSchema>;

export const passwordResetTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string().min(1),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable(),
});
assertExtends<PasswordResetToken, z.infer<typeof passwordResetTokenSchema>>();

export const roleChangeRequestSchema = z.object({
  id: z.string().uuid(),
  targetUserId: z.string().uuid(),
  fromRole: roleSchema,
  toRole: roleSchema,
  requestedBy: z.string().uuid(),
  approvedBy: z.string().uuid().nullable(),
  status: roleChangeStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
assertExtends<RoleChangeRequest, z.infer<typeof roleChangeRequestSchema>>();

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  actorType: auditActorTypeSchema,
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  correlationId: z.string().uuid(),
  beforeValue: z.record(z.unknown()).nullable(),
  afterValue: z.record(z.unknown()).nullable(),
  occurredAt: z.string().datetime(),
});
assertExtends<AuditLog, z.infer<typeof auditLogSchema>>();

/** Entity defined here (Part 5/9B); write path owned by Epic E15 (Billing). */
export const entitlementChangeLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  entitlementType: z.string().min(1),
  action: entitlementActionSchema,
  source: z.string().min(1),
  occurredAt: z.string().datetime(),
});
assertExtends<EntitlementChangeLog, z.infer<typeof entitlementChangeLogSchema>>();

// --- Endpoint request/response payloads (Part 6), composed from the entity
// schemas above (E2-T8) ---

/**
 * `POST /v1/auth/register` request body. `tosAccepted`/`privacyPolicyAccepted`
 * use `z.literal(true)` — registration without accepting both is a
 * validation failure, not a state the handler needs to branch on.
 * `password` is plaintext-in-transit-over-TLS, never persisted as-is
 * (hashed via `@linguaai/utils`'s `hashPassword`) — the 12-character floor
 * matches the same minimum `packages/database/scripts/bootstrap-admin.ts`
 * (E2-T5) already enforces for the identical reason (Argon2id, SECURITY.md
 * §2), kept consistent rather than inventing a second policy.
 */
export const registerRequestSchema = z.object({
  email: userSchema.shape.email,
  password: z.string().min(12).max(256),
  displayName: userSchema.shape.displayName,
  locale: userSchema.shape.locale,
  timezone: userSchema.shape.timezone,
  tosAccepted: z.literal(true),
  privacyPolicyAccepted: z.literal(true),
  marketingConsent: z.boolean().default(false),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** `POST /v1/auth/login` request body. */
export const loginRequestSchema = z.object({
  email: userSchema.shape.email,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The `User` shape returned to clients — never `passwordHash`/`mfaSecret`
 * (SECURITY.md §2/§4) or `tokensValidAfter` (an internal revocation
 * mechanism, not user-facing state).
 */
export const publicUserSchema = userSchema.omit({
  passwordHash: true,
  mfaSecret: true,
  tokensValidAfter: true,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/**
 * `POST /v1/auth/login` response body — for a web caller (no
 * `X-Client-Platform: mobile` request header, E21 T1) the refresh token
 * travels only in the httpOnly cookie (Part 8), never in this JSON body,
 * exactly as originally designed. `refreshToken` is optional here
 * specifically for the mobile transport (ADR-018 already committed to
 * "secure device storage" for mobile, which requires the raw token be
 * reachable at all — a native HTTP client has no cookie jar to receive
 * Part 8's `Set-Cookie` from) — `AuthController.login` only ever populates
 * it for a request carrying that header, so every existing web-facing
 * caller's response shape is unchanged. Same discriminated-union shape as
 * `oauthCallbackResponseSchema` (E2-T11/T12), for the identical reason:
 * Part 6's endpoint table marks `POST /v1/auth/mfa/challenge` as returning
 * "Partial session (post-password, pre-MFA)" for an MFA-enrolled
 * `ADMIN`/`ENTERPRISE_ADMIN` (ADR-011's mandatory step-up), so this
 * endpoint cannot always return a full session — `MFA_REQUIRED` carries
 * only the opaque `challengeToken` the caller resubmits to `/mfa/challenge`,
 * never an access token. `AUTHENTICATED`'s own shape (`accessToken`/`user`,
 * no `status` narrowing needed by existing callers) is otherwise unchanged
 * from before this union existed — every e2e/unit test reading
 * `loginRes.body.accessToken` directly still resolves, since that key is
 * still present at the top level for the (overwhelmingly common) non-MFA
 * case.
 */
export const loginResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('AUTHENTICATED'),
    accessToken: z.string().min(1),
    user: publicUserSchema,
    refreshToken: z.string().min(1).optional(),
  }),
  z.object({ status: z.literal('MFA_REQUIRED'), challengeToken: z.string().min(1) }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * `POST /v1/auth/refresh` response body (E2-T9) — same web/mobile
 * transport split as `loginResponseSchema` above: `refreshToken` is present
 * only when the rotated token isn't also being set via cookie (i.e., the
 * request itself supplied its current refresh token via body, not cookie —
 * `AuthController.refresh`'s own mobile branch, E21 T1).
 */
export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

/**
 * `POST /v1/auth/refresh`/`POST /v1/auth/logout` request body (E21 T1) —
 * the mobile-only alternative to the `refreshToken` cookie: optional so an
 * ordinary web request (cookie-based, no body at all) still validates.
 * `AuthController` reads the cookie first when present; this body is only
 * ever consulted as the fallback for a caller with no cookie jar. `.default({})`
 * (not a plain `z.object()`) is load-bearing: a cookie-only caller sends no
 * request body and no JSON `Content-Type` at all, so Express's body parser
 * never runs and `req.body` is `undefined`, not `{}` — a real, found bug
 * (E21 T1) where the first draft of this schema 400'd every ordinary
 * cookie-based `/refresh`/`logout` call before it ever reached the
 * controller's own cookie-vs-body branching.
 */
export const refreshRequestBodySchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});
export type RefreshRequestBody = z.infer<typeof refreshRequestBodySchema>;

/** OAuth callback response bodies (E2-T11/T12). `authenticated` matches `LoginResponse`'s shape; `link_required` is Part 8/High-3's "distinct response directing the caller to log in with their existing password first" — never an auto-link, never an error; `linked` is the authenticated-linking flow's (`POST /v1/users/me/oauth-accounts`, E2-T12) success response. */
export const oauthCallbackResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('AUTHENTICATED'),
    accessToken: z.string().min(1),
    user: publicUserSchema,
  }),
  z.object({ status: z.literal('LINK_REQUIRED'), email: z.string().email() }),
  z.object({
    status: z.literal('LINKED'),
    provider: oauthProviderSchema,
    providerAccountId: z.string().min(1),
    linkedAt: z.string().datetime(),
  }),
]);
export type OAuthCallbackResponse = z.infer<typeof oauthCallbackResponseSchema>;

/** `POST /v1/auth/mfa/enroll` response body (E2-T13) — the QR/manual-entry payload; writes nothing yet (Part 6). */
export const mfaEnrollResponseSchema = z.object({
  secret: z.string().min(1),
  otpauthUrl: z.string().min(1),
});
export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>;

/** `POST /v1/auth/mfa/verify` request body (E2-T13) — `secret` is the pending secret `mfa/enroll` returned, resubmitted to complete enrollment (see mfa.service.ts's doc comment for why). */
export const mfaVerifyRequestSchema = z.object({
  secret: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be exactly 6 digits'),
});
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

/**
 * `POST /v1/auth/mfa/challenge` request body (Part 6, E2-T22) —
 * `challengeToken` is the opaque `MFA_REQUIRED` value `loginResponseSchema`
 * returned; `code` is the caller's live TOTP against their already-completed
 * enrollment (distinct from `mfaVerifyRequestSchema`'s `secret`+`code`, which
 * only exists for *completing* enrollment, before any secret is persisted).
 */
export const mfaChallengeRequestSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be exactly 6 digits'),
});
export type MfaChallengeRequest = z.infer<typeof mfaChallengeRequestSchema>;

/**
 * A member to add — used both for `POST /v1/organizations`'s single
 * "designate the first ENTERPRISE_ADMIN" and `POST .../members`'s
 * one-or-many add (E2-T15). Part 9's "Bulk CSV import creates User +
 * OrganizationMembership in the same transaction... so no bulk-imported
 * user is ever tenant-unscoped" applies identically whether the email
 * belongs to an existing user or not — this one shape covers both. CSV
 * parsing itself is a client-side concern (no other endpoint in Part 6's
 * surface is `multipart/form-data`; this endpoint's own wire contract is
 * this JSON array either way) — flagged as an explicit interpretation,
 * not stated in the design doc's own text.
 */
export const organizationMemberInputSchema = z.object({
  email: userSchema.shape.email,
  displayName: userSchema.shape.displayName,
  locale: userSchema.shape.locale,
  timezone: userSchema.shape.timezone,
});
export type OrganizationMemberInput = z.infer<typeof organizationMemberInputSchema>;

/** `POST /v1/organizations` request body (Part 6) — platform-`ADMIN`-only; creates the org and its first `ENTERPRISE_ADMIN` atomically (Part 9's provisioning text). */
export const createOrganizationRequestSchema = z.object({
  name: organizationSchema.shape.name,
  dataRegion: organizationSchema.shape.dataRegion.optional(),
  firstAdmin: organizationMemberInputSchema,
});
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

/**
 * `POST /v1/users/:id/role-change-requests` request body (Part 9A, E2-T16).
 * `fromRole` is deliberately not a client-supplied field — the service
 * derives it server-side from the target user's actual current role
 * (Part 9C discipline: never trust a client-supplied value for anything
 * feeding a privileged decision).
 */
export const initiateRoleChangeRequestSchema = z.object({
  toRole: roleSchema,
});
export type InitiateRoleChangeRequest = z.infer<typeof initiateRoleChangeRequestSchema>;

export const roleChangeRequestResponseSchema = z.object({
  id: z.string().uuid(),
  targetUserId: z.string().uuid(),
  fromRole: roleSchema,
  toRole: roleSchema,
  requestedBy: z.string().uuid(),
  approvedBy: z.string().uuid().nullable(),
  status: roleChangeStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type RoleChangeRequestResponse = z.infer<typeof roleChangeRequestResponseSchema>;

/** `PATCH /v1/organizations/:id/members/:userId/role` request body (Part 6/9A, E2-T16). */
export const changeOrgMemberRoleRequestSchema = z.object({
  orgRole: orgRoleSchema,
});
export type ChangeOrgMemberRoleRequest = z.infer<typeof changeOrgMemberRoleRequestSchema>;

/**
 * `POST /v1/organizations/:id/members` request body — one or more members
 * (a single add and a CSV-derived bulk add share this exact shape). Capped
 * at 500 per request — a reasonable defensive bound the design doc doesn't
 * itself specify (flagged, not derived from Part 6's text).
 */
export const addOrganizationMembersRequestSchema = z.object({
  members: z.array(organizationMemberInputSchema).min(1).max(500),
  orgRole: orgRoleSchema.default('MEMBER'),
});
export type AddOrganizationMembersRequest = z.infer<typeof addOrganizationMembersRequestSchema>;

/** A member row as returned by the organization endpoints — never the full `User` shape (no `passwordHash`/`mfaSecret`, same discipline as `publicUserSchema`). */
export const organizationMemberSchema = z.object({
  userId: z.string().uuid(),
  email: userSchema.shape.email,
  displayName: userSchema.shape.displayName,
  orgRole: orgRoleSchema,
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const addOrganizationMembersResponseSchema = z.object({
  members: z.array(organizationMemberSchema),
});
export type AddOrganizationMembersResponse = z.infer<typeof addOrganizationMembersResponseSchema>;

/**
 * `GET /v1/organizations/:id` response body — the org plus its member
 * list. Part 6 lists no separate "list members" endpoint, so the member
 * list is folded into org detail here (flagged interpretation, not an
 * invented new endpoint).
 */
export const organizationDetailResponseSchema = organizationSchema.extend({
  members: z.array(organizationMemberSchema),
});
export type OrganizationDetailResponse = z.infer<typeof organizationDetailResponseSchema>;

/**
 * `GET /v1/audit-log` / `GET /v1/organizations/:id/audit-log` query params
 * (Part 6, E2-T17) — "filterable" (Part 6's own word for the platform-wide
 * endpoint), cursor-based per API_GUIDELINES.md §4 ("any list that changes
 * while being paged" — an audit log is exactly that, append-only and
 * continuously growing). Query-string values arrive as strings even for
 * `limit`, hence `z.coerce`.
 */
export const auditLogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  action: z.string().min(1).optional(),
  actorUserId: z.string().uuid().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogListResponseSchema = z.object({
  data: z.array(auditLogSchema),
  meta: z.object({ nextCursor: z.string().uuid().nullable() }),
});
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

/**
 * `PATCH /v1/users/me` request body (Part 6, E2-T18) — exactly the four
 * columns `app_role` may write on `User` directly (E2-T6's allowlist); every
 * other field is either server-derived or a Part 9C privileged column with
 * no path here regardless of what a caller submits. All optional (a partial
 * update), but at least one must be present — an empty PATCH is a
 * validation error, not a silent no-op.
 */
export const updateProfileRequestSchema = z
  .object({
    displayName: userSchema.shape.displayName.optional(),
    avatarUrl: userSchema.shape.avatarUrl.optional(),
    locale: userSchema.shape.locale.optional(),
    timezone: userSchema.shape.timezone.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** `GET /v1/users/me` response body (Part 6) — the public `User` shape plus its optional `UserProfile` (null until PRD.md §5.1's onboarding flow, a later Epic, creates one). */
export const currentUserResponseSchema = publicUserSchema.extend({
  profile: userProfileSchema.nullable(),
});
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;

/**
 * `POST /v1/users/me/deletion-request` response body (Part 6) — 202
 * Accepted, matching the design doc's own "async cascade" framing even
 * though this task's actual implementation performs the (currently small,
 * E2-scope) cascade synchronously within the request — see
 * `users.service.ts`'s `requestDeletion` doc comment for why.
 */
export const deletionRequestResponseSchema = z.object({
  status: z.literal('ACCEPTED'),
  requestedAt: z.string().datetime(),
});
export type DeletionRequestResponse = z.infer<typeof deletionRequestResponseSchema>;

/** `POST /v1/auth/password-reset/request` request body (Part 6, E2-T19). */
export const passwordResetRequestSchema = z.object({
  email: userSchema.shape.email,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/**
 * `POST /v1/auth/password-reset/request` response body — deliberately the
 * *same* `EMAIL_SENT` shape whether the email belongs to no account or to a
 * real password account (SECURITY.md §6 enumeration resistance; the E2
 * implementation plan's own T19 acceptance criteria: "identical-shape
 * responses regardless of account existence"). `OAUTH_ACCOUNT` is the one
 * deliberate, narrow, product-accepted exception — Part 6's own text
 * requires "redirect messaging... never a dead end" for OAuth-only accounts,
 * which necessarily reveals that *this specific* email has an OAuth-only
 * account (the same trade-off Google/GitHub's own password-reset flows make
 * for the identical reason) — a materially different, narrower disclosure
 * than "any account exists for this email at all."
 */
export const passwordResetRequestResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('EMAIL_SENT') }),
  z.object({ status: z.literal('OAUTH_ACCOUNT'), providers: z.array(oauthProviderSchema) }),
]);
export type PasswordResetRequestResponse = z.infer<typeof passwordResetRequestResponseSchema>;

/** `POST /v1/auth/password-reset/confirm` request body (Part 6) — same 12-character floor as registration/bootstrap (Argon2id, SECURITY.md §2), kept consistent rather than inventing a second policy. */
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(12).max(256),
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmSchema>;

// --- Domain event payloads (EVENT_ARCHITECTURE.md §3) ---

/**
 * The real payload shape `AuthService.register()`/`OAuthService`'s own
 * registration path publish for `identity.user.registered` (E2-T8,
 * `EVENT_ARCHITECTURE.md`'s own catalog). Moved here (E16 T2) — a consumer
 * outside `apps/api` (`notification-service`, the epic's own second real
 * consumer) cannot import from `apps/*` (ADR-015), so this schema has to
 * live in a shared package either way, matching `assessmentAttemptCompletedPayloadSchema`'s
 * own precedent (`@linguaai/validation/learning`) for the identical reason.
 */
export const identityUserRegisteredPayloadSchema = z.object({
  signupSource: z.string().min(1),
});
export type IdentityUserRegisteredPayload = z.infer<typeof identityUserRegisteredPayloadSchema>;

/**
 * The real payload shape `AuthService.requestPasswordReset()` publishes for
 * `identity.password.reset_requested` (Part 6, E2-T19; extended E16 T2).
 * `resetToken` (the raw, one-time token) was added at E16 T2 specifically
 * to unblock `notification-service`'s own real password-reset email: the
 * `PasswordResetToken` row stores only `tokenHash` (an irreversible hash,
 * Part 10) and `resetTokenReference` is just that row's own `id`, which
 * "reveals nothing usable to complete a reset" — true, and by design, right
 * up until a real consumer needs to build a working reset link, which is
 * exactly `notification-service`'s own job. Passing the raw token through
 * the event is the same trade-off any async "send this one-time secret by
 * email" delivery pipeline makes; the token is already 1-hour-lived and
 * single-use-enforced by `confirmPasswordReset()`'s own atomic claim
 * (`updateMany({ where: { usedAt: null } })`), bounding real exposure to a
 * short-lived BullMQ job payload on internal-only Redis infrastructure, not
 * an unbounded new risk. A real, flagged trade-off (RISK_REGISTER), not a
 * silent one.
 */
export const identityPasswordResetRequestedPayloadSchema = z.object({
  resetTokenReference: z.string().uuid(),
  resetToken: z.string().min(1),
});
export type IdentityPasswordResetRequestedPayload = z.infer<
  typeof identityPasswordResetRequestedPayloadSchema
>;
