import { describe, expect, it } from 'vitest';

// Relative import, not the self-referencing @linguaai/types/identity path
// the root src/index.test.ts uses — that path resolves through the built
// dist/ output (proving the package "exports" map, T7's own goal) and
// can't be coverage-instrumented back to this source file. This file's
// job is exercising the real logic, so it imports the source directly.
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
} from './index.js';

// Runtime enum arrays are consumed directly by @linguaai/validation/identity
// (z.enum(ROLES), etc.) — a typo or a dropped value here would silently
// change what every Zod schema built from it accepts, so the exact
// contents are asserted against Part 5 of the E2 design, not just "is an
// array."
describe('identity enum arrays match Part 5 exactly', () => {
  it('ROLES', () => {
    expect(ROLES).toEqual(['USER', 'TEACHER', 'ADMIN', 'ENTERPRISE_ADMIN']);
  });

  it('USER_STATUSES', () => {
    expect(USER_STATUSES).toEqual(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED']);
  });

  it('OAUTH_PROVIDERS (Facebook deferred — ADR-020)', () => {
    expect(OAUTH_PROVIDERS).toEqual(['GOOGLE', 'APPLE']);
  });

  it('GOAL_TYPES', () => {
    expect(GOAL_TYPES).toEqual(['TRAVEL', 'CAREER', 'EXAM', 'GENERAL_FLUENCY']);
  });

  it('ORG_ROLES', () => {
    expect(ORG_ROLES).toEqual(['MEMBER', 'ENTERPRISE_ADMIN']);
  });

  it('CONSENT_TYPES (no parental-consent type — ADR-013)', () => {
    expect(CONSENT_TYPES).toEqual(['TOS', 'PRIVACY_POLICY', 'MARKETING']);
  });

  it('DEVICE_PLATFORMS', () => {
    expect(DEVICE_PLATFORMS).toEqual(['IOS', 'ANDROID', 'WEB']);
  });

  it('ROLE_CHANGE_STATUSES', () => {
    expect(ROLE_CHANGE_STATUSES).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
  });

  it('AUDIT_ACTOR_TYPES', () => {
    expect(AUDIT_ACTOR_TYPES).toEqual(['USER', 'SYSTEM', 'SERVICE']);
  });

  it('ENTITLEMENT_ACTIONS', () => {
    expect(ENTITLEMENT_ACTIONS).toEqual(['GRANTED', 'REVOKED', 'CHANGED']);
  });
});
