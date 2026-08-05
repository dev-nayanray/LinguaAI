// Identity bounded context (ARCHITECTURE.md §2.1). Mirrors
// docs/epics/E2-identity-access-platform.md Part 5 field-for-field —
// this file is the source of truth CODING_STANDARDS.md §1 refers to as
// "domain types live in packages/types, subpathed by domain"; Zod schemas
// in @linguaai/validation/identity import the runtime enum arrays below
// rather than redefining them, per that package's dependency on this one
// (E1/Part 5 build order).
//
// Timestamps are typed `string` (ISO 8601) — these are wire/domain types
// consumed across the API boundary (apps/api responses, apps/web forms),
// not Prisma's own generated types (packages/database), which use `Date`.

export const ROLES = ['USER', 'TEACHER', 'ADMIN', 'ENTERPRISE_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const OAUTH_PROVIDERS = ['GOOGLE', 'APPLE'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const GOAL_TYPES = ['TRAVEL', 'CAREER', 'EXAM', 'GENERAL_FLUENCY'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const ORG_ROLES = ['MEMBER', 'ENTERPRISE_ADMIN'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CONSENT_TYPES = ['TOS', 'PRIVACY_POLICY', 'MARKETING'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const DEVICE_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const ROLE_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type RoleChangeStatus = (typeof ROLE_CHANGE_STATUSES)[number];

export const AUDIT_ACTOR_TYPES = ['USER', 'SYSTEM', 'SERVICE'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const ENTITLEMENT_ACTIONS = ['GRANTED', 'REVOKED', 'CHANGED'] as const;
export type EntitlementAction = (typeof ENTITLEMENT_ACTIONS)[number];

/**
 * The full backend-truth shape, including `passwordHash`/`mfaSecret` —
 * never send this type's value directly over the wire. API response
 * schemas in @linguaai/validation/identity omit these two fields
 * explicitly; this type is not itself wire-safe.
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  role: Role;
  status: UserStatus;
  mfaEnrolled: boolean;
  mfaSecret: string | null;
  organizationId: string | null;
  tokensValidAfter: string;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthAccount {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerAccountId: string;
  linkedAt: string;
}

export interface UserProfile {
  userId: string;
  nativeLanguage: string;
  targetLanguages: string[];
  goalType: GoalType;
  dailyTimeCommitmentMinutes: number | null;
}

export interface Organization {
  id: string;
  name: string;
  dataRegion: string | null;
  seatCount: number;
  createdAt: string;
}

export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
}

export interface Session {
  id: string;
  userId: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

/** `tokenHash` only — the raw refresh token is never represented in this type. */
export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  sessionId: string;
  expiresAt: string;
  rotatedFromId: string | null;
  revokedAt: string | null;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentType;
  policyVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
}

export interface DeviceToken {
  id: string;
  userId: string;
  platform: DevicePlatform;
  token: string;
  active: boolean;
}

/** `tokenHash` only — the raw reset token is never represented in this type. */
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface RoleChangeRequest {
  id: string;
  targetUserId: string;
  fromRole: Role;
  toRole: Role;
  requestedBy: string;
  approvedBy: string | null;
  status: RoleChangeStatus;
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorType: AuditActorType;
  action: string;
  targetType: string;
  targetId: string;
  tenantId: string | null;
  correlationId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  occurredAt: string;
}

/** Entity defined here (Part 5/9B); write path owned by Epic E15 (Billing). */
export interface EntitlementChangeLog {
  id: string;
  userId: string;
  entitlementType: string;
  action: EntitlementAction;
  source: string;
  occurredAt: string;
}
