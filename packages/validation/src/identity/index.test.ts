import { describe, expect, it } from 'vitest';

// Relative import — see packages/types/src/identity/index.test.ts for why
// (the self-referencing @linguaai/validation/identity path resolves
// through dist/ and can't be coverage-instrumented back to this file).
import {
  auditLogSchema,
  consentRecordSchema,
  currentUserResponseSchema,
  deletionRequestResponseSchema,
  deviceTokenSchema,
  entitlementChangeLogSchema,
  oauthAccountSchema,
  organizationMembershipSchema,
  organizationSchema,
  passwordResetTokenSchema,
  refreshTokenSchema,
  roleChangeRequestSchema,
  sessionSchema,
  updateProfileRequestSchema,
  userProfileSchema,
  userSchema,
} from './index.js';

const uuid = '9c858f1b-45c0-4b8e-9c1e-2f6a9c9b6d21';
const otherUuid = '1a1b2c3d-4e5f-4061-8a9b-0c1d2e3f4a5b';
const timestamp = '2026-07-30T12:00:00.000Z';

describe('userSchema', () => {
  const valid = {
    id: uuid,
    email: 'learner@example.com',
    passwordHash: null,
    displayName: 'Learner',
    avatarUrl: null,
    locale: 'en',
    timezone: 'UTC',
    role: 'USER',
    status: 'ACTIVE',
    mfaEnrolled: false,
    mfaSecret: null,
    organizationId: null,
    tokensValidAfter: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  it('accepts a valid consumer account (null organizationId, OAuth-only passwordHash)', () => {
    expect(userSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = userSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects a role outside the four-value enum (never client-settable to an arbitrary string)', () => {
    const result = userSchema.safeParse({ ...valid, role: 'SUPER_ADMIN' });
    expect(result.success).toBe(false);
  });
});

describe('oauthAccountSchema', () => {
  it('accepts Google/Apple, rejects Facebook (ADR-020)', () => {
    const base = { id: uuid, userId: otherUuid, providerAccountId: 'sub_123', linkedAt: timestamp };
    expect(oauthAccountSchema.safeParse({ ...base, provider: 'GOOGLE' }).success).toBe(true);
    expect(oauthAccountSchema.safeParse({ ...base, provider: 'APPLE' }).success).toBe(true);
    expect(oauthAccountSchema.safeParse({ ...base, provider: 'FACEBOOK' }).success).toBe(false);
  });
});

describe('userProfileSchema', () => {
  it('accepts a valid profile', () => {
    const result = userProfileSchema.safeParse({
      userId: uuid,
      nativeLanguage: 'es',
      targetLanguages: ['en'],
      goalType: 'TRAVEL',
      dailyTimeCommitmentMinutes: 20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive daily time commitment', () => {
    const result = userProfileSchema.safeParse({
      userId: uuid,
      nativeLanguage: 'es',
      targetLanguages: ['en'],
      goalType: 'TRAVEL',
      dailyTimeCommitmentMinutes: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('organizationSchema', () => {
  it('accepts a valid organization with dataRegion reserved-but-null (MULTITENANCY.md §5)', () => {
    const result = organizationSchema.safeParse({
      id: uuid,
      name: 'Acme Corp',
      dataRegion: null,
      seatCount: 50,
      createdAt: timestamp,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative seat count', () => {
    const result = organizationSchema.safeParse({
      id: uuid,
      name: 'Acme Corp',
      dataRegion: null,
      seatCount: -1,
      createdAt: timestamp,
    });
    expect(result.success).toBe(false);
  });
});

describe('organizationMembershipSchema', () => {
  it('accepts MEMBER and ENTERPRISE_ADMIN, rejects an arbitrary orgRole', () => {
    const base = { id: uuid, userId: uuid, organizationId: otherUuid };
    expect(organizationMembershipSchema.safeParse({ ...base, orgRole: 'MEMBER' }).success).toBe(
      true,
    );
    expect(
      organizationMembershipSchema.safeParse({ ...base, orgRole: 'ENTERPRISE_ADMIN' }).success,
    ).toBe(true);
    expect(organizationMembershipSchema.safeParse({ ...base, orgRole: 'OWNER' }).success).toBe(
      false,
    );
  });
});

describe('sessionSchema', () => {
  it('accepts a valid, non-revoked session', () => {
    const result = sessionSchema.safeParse({
      id: uuid,
      userId: uuid,
      deviceLabel: 'Chrome on macOS',
      createdAt: timestamp,
      lastSeenAt: timestamp,
      revokedAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('refreshTokenSchema', () => {
  it('accepts a token record (hash only — never the raw token)', () => {
    const result = refreshTokenSchema.safeParse({
      id: uuid,
      userId: uuid,
      tokenHash: 'a'.repeat(64),
      sessionId: otherUuid,
      expiresAt: timestamp,
      rotatedFromId: null,
      revokedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing tokenHash', () => {
    const result = refreshTokenSchema.safeParse({
      id: uuid,
      userId: uuid,
      sessionId: otherUuid,
      expiresAt: timestamp,
      rotatedFromId: null,
      revokedAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('consentRecordSchema', () => {
  it('accepts TOS/PRIVACY_POLICY/MARKETING, rejects a parental-consent type (ADR-013)', () => {
    const base = {
      id: uuid,
      userId: uuid,
      policyVersion: 'v1',
      grantedAt: timestamp,
      withdrawnAt: null,
    };
    expect(consentRecordSchema.safeParse({ ...base, consentType: 'TOS' }).success).toBe(true);
    expect(
      consentRecordSchema.safeParse({ ...base, consentType: 'PARENTAL_CONSENT' }).success,
    ).toBe(false);
  });
});

describe('deviceTokenSchema', () => {
  it('accepts a valid device token', () => {
    const result = deviceTokenSchema.safeParse({
      id: uuid,
      userId: uuid,
      platform: 'IOS',
      token: 'apns_token',
      active: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('passwordResetTokenSchema', () => {
  it('accepts an unused, unexpired token record', () => {
    const result = passwordResetTokenSchema.safeParse({
      id: uuid,
      userId: uuid,
      tokenHash: 'b'.repeat(64),
      expiresAt: timestamp,
      usedAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('roleChangeRequestSchema', () => {
  it('accepts a pending ADMIN-involving request', () => {
    const result = roleChangeRequestSchema.safeParse({
      id: uuid,
      targetUserId: uuid,
      fromRole: 'USER',
      toRole: 'ADMIN',
      requestedBy: otherUuid,
      approvedBy: null,
      status: 'PENDING',
      expiresAt: timestamp,
      createdAt: timestamp,
      resolvedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const result = roleChangeRequestSchema.safeParse({
      id: uuid,
      targetUserId: uuid,
      fromRole: 'USER',
      toRole: 'ADMIN',
      requestedBy: otherUuid,
      approvedBy: null,
      status: 'AUTO_APPROVED',
      expiresAt: timestamp,
      createdAt: timestamp,
      resolvedAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('auditLogSchema', () => {
  it('accepts a system-actor entry with null actorUserId (bootstrap path, Part 9A)', () => {
    const result = auditLogSchema.safeParse({
      id: uuid,
      actorUserId: null,
      actorType: 'SYSTEM',
      action: 'user.bootstrap_admin_created',
      targetType: 'User',
      targetId: uuid,
      tenantId: null,
      correlationId: uuid,
      beforeValue: null,
      afterValue: { role: 'ADMIN' },
      occurredAt: timestamp,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing correlationId', () => {
    const result = auditLogSchema.safeParse({
      id: uuid,
      actorUserId: null,
      actorType: 'SYSTEM',
      action: 'user.bootstrap_admin_created',
      targetType: 'User',
      targetId: uuid,
      tenantId: null,
      beforeValue: null,
      afterValue: null,
      occurredAt: timestamp,
    });
    expect(result.success).toBe(false);
  });
});

describe('entitlementChangeLogSchema', () => {
  it('accepts a valid entry (entity defined in E2, write path owned by E15)', () => {
    const result = entitlementChangeLogSchema.safeParse({
      id: uuid,
      userId: uuid,
      entitlementType: 'premium_subscription',
      action: 'GRANTED',
      source: 'stripe_webhook',
      occurredAt: timestamp,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateProfileRequestSchema', () => {
  it('accepts a partial update touching only one of the four allowed columns', () => {
    expect(updateProfileRequestSchema.safeParse({ displayName: 'New Name' }).success).toBe(true);
  });

  it('accepts all four allowed columns at once, including a null avatarUrl', () => {
    const result = updateProfileRequestSchema.safeParse({
      displayName: 'New Name',
      avatarUrl: null,
      locale: 'fr-FR',
      timezone: 'Europe/Paris',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body — at least one field must be provided', () => {
    expect(updateProfileRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid value for an allowed column (empty displayName)', () => {
    expect(updateProfileRequestSchema.safeParse({ displayName: '' }).success).toBe(false);
  });
});

describe('currentUserResponseSchema', () => {
  it('accepts the public user shape with profile: null (no onboarding flow exists yet)', () => {
    const result = currentUserResponseSchema.safeParse({
      id: uuid,
      email: 'learner@example.com',
      displayName: 'Learner',
      avatarUrl: null,
      locale: 'en',
      timezone: 'UTC',
      role: 'USER',
      status: 'ACTIVE',
      mfaEnrolled: false,
      organizationId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      profile: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a body carrying passwordHash — never part of the public shape', () => {
    const result = currentUserResponseSchema.safeParse({
      id: uuid,
      email: 'learner@example.com',
      passwordHash: 'should-not-be-here',
      displayName: 'Learner',
      avatarUrl: null,
      locale: 'en',
      timezone: 'UTC',
      role: 'USER',
      status: 'ACTIVE',
      mfaEnrolled: false,
      organizationId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      profile: null,
    });
    // Zod strips unrecognized keys by default rather than rejecting them —
    // this asserts the parsed *output* never carries passwordHash, which is
    // the actual security property (SECURITY.md §2/§4), not that the input
    // was rejected.
    expect(result.success && !('passwordHash' in result.data)).toBe(true);
  });
});

describe('deletionRequestResponseSchema', () => {
  it('accepts the ACCEPTED response shape', () => {
    const result = deletionRequestResponseSchema.safeParse({
      status: 'ACCEPTED',
      requestedAt: timestamp,
    });
    expect(result.success).toBe(true);
  });

  it('rejects any status other than the literal ACCEPTED', () => {
    const result = deletionRequestResponseSchema.safeParse({
      status: 'PENDING',
      requestedAt: timestamp,
    });
    expect(result.success).toBe(false);
  });
});
