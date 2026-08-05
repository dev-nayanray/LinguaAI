import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import {
  registerAndLogin,
  TEST_PASSWORD,
  uniqueTestEmail,
  type RegisteredSession,
} from './helpers/auth-flow.js';

/**
 * Integration tests against real Postgres — same discipline as the other
 * e2e suites. `OrganizationsModule` (E2-T15) is the first real business
 * module wired behind `RolesGuard`/`MfaGuard` (both built, unused, in
 * E2-T14), and the first real production consumer of `tenant-rls.extension.ts`
 * for `getOrganization`'s read path.
 */
describe('OrganizationsModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    const orgIds = createdOrgIds.filter((id): id is string => Boolean(id));
    // Teardown removes every membership regardless of the
    // last-ENTERPRISE_ADMIN invariant (a real test scenario deliberately
    // leaves some orgs with exactly one) — `setupPrisma` connects as the
    // migration superuser, so it can disable triggers for this session
    // only; application code never does this.
    await setupPrisma.$executeRawUnsafe('SET session_replication_role = replica');
    await setupPrisma.organizationMembership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    // CSV-bulk-created users (never "registered" through the app, so never
    // tracked in createdUserIds at registration time) are cleaned up via
    // their organizationId instead, alongside the orgs themselves.
    if (orgIds.length > 0) {
      await setupPrisma.organizationMembership.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await setupPrisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (orgIds.length > 0) {
      await setupPrisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await setupPrisma.$disconnect();
    await app.close();
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  /** Mutates DB state directly (superuser), then re-logs-in so the caller's JWT reflects it — role/organizationId/orgRole are all snapshotted at login time (Part 8). */
  /**
   * `mfaSecret` (E2-T22, ADR-011 step-up): if the caller is an MFA-enrolled
   * ADMIN/ENTERPRISE_ADMIN, `/v1/auth/login` now returns `MFA_REQUIRED`
   * instead of a full session — this completes the second step via
   * `/v1/auth/mfa/challenge` automatically, matching the real login flow.
   * Only `freshPlatformAdmin` (below) ever needs to pass one; every other
   * caller here logs back in as a never-enrolled user, for whom login
   * still returns `AUTHENTICATED` directly.
   */
  async function reLoginAs(
    session: RegisteredSession,
    mutate: () => Promise<void>,
    mfaSecret?: string,
  ): Promise<RegisteredSession> {
    await mutate();
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: session.email, password: TEST_PASSWORD });
    if (res.body.status === 'MFA_REQUIRED') {
      const challengeRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({
          challengeToken: res.body.challengeToken,
          code: authenticator.generate(mfaSecret!),
        });
      return { ...session, accessToken: challengeRes.body.accessToken as string };
    }
    return { ...session, accessToken: res.body.accessToken as string };
  }

  /**
   * `MfaGuard` (E2-T13/T14) blocks any `role: 'ADMIN'` caller who hasn't
   * completed MFA enrollment — `OrganizationsController`'s guard chain
   * includes it, so a platform-admin test session needs a real
   * enroll+verify round trip (mirroring `mfa.e2e-spec.ts`'s own pattern)
   * before any `/v1/organizations` call, not just the role promotion.
   * `mfaEnrolled` is read live from the DB on each request (not a JWT
   * claim, Part 8's claim shape has no such field), so this can happen
   * before or after the role-promotion re-login — done here first, on the
   * original (pre-promotion) access token, since `/mfa/*` doesn't care
   * about role.
   */
  async function completeMfaEnrollment(session: RegisteredSession): Promise<string> {
    const enrollRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .set('Authorization', `Bearer ${session.accessToken}`);
    const secret = enrollRes.body.secret as string;
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ secret, code: authenticator.generate(secret) });
    return secret;
  }

  async function freshPlatformAdmin(): Promise<RegisteredSession> {
    const session = await freshSession();
    const secret = await completeMfaEnrollment(session);
    return reLoginAs(
      session,
      () =>
        setupPrisma.user
          .update({ where: { id: session.userId }, data: { role: 'ADMIN' } })
          .then(() => undefined),
      secret,
    );
  }

  async function freshOrg(): Promise<{ orgId: string; enterpriseAdmin: RegisteredSession }> {
    const admin = await freshPlatformAdmin();
    const enterpriseAdminSeed = await freshSession();
    const res = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: `Test Org ${enterpriseAdminSeed.userId}`,
        firstAdmin: {
          email: enterpriseAdminSeed.email,
          displayName: 'Org Admin',
          locale: 'en-US',
          timezone: 'UTC',
        },
      });
    createdOrgIds.push(res.body.id as string);
    const enterpriseAdmin = await reLoginAs(enterpriseAdminSeed, async () => undefined);
    return { orgId: res.body.id as string, enterpriseAdmin };
  }

  describe('POST /v1/organizations', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .send({
          name: 'x',
          firstAdmin: { email: 'a@test.local', displayName: 'A', locale: 'en-US', timezone: 'UTC' },
        });
      expect(res.status).toBe(401);
    });

    it('rejects a non-platform-ADMIN caller with 403', async () => {
      const { accessToken } = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'x',
          firstAdmin: { email: 'a@test.local', displayName: 'A', locale: 'en-US', timezone: 'UTC' },
        });
      expect(res.status).toBe(403);
    });

    it("happy path: creates the org and designates a brand-new user (email doesn't exist yet) as its first ENTERPRISE_ADMIN", async () => {
      const admin = await freshPlatformAdmin();
      const newAdminEmail = uniqueTestEmail();

      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Acme Corp',
          firstAdmin: {
            email: newAdminEmail,
            displayName: 'Acme Admin',
            locale: 'en-US',
            timezone: 'UTC',
          },
        });
      createdOrgIds.push(res.body.id as string);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Acme Corp');
      expect(res.body.members).toEqual([
        expect.objectContaining({ email: newAdminEmail, orgRole: 'ENTERPRISE_ADMIN' }),
      ]);

      const createdUser = await setupPrisma.user.findUnique({ where: { email: newAdminEmail } });
      expect(createdUser?.organizationId).toBe(res.body.id);
      expect(createdUser?.passwordHash).toBeNull();
    });

    it('happy path: attaches an existing, org-less user as first ENTERPRISE_ADMIN instead of creating a duplicate', async () => {
      const admin = await freshPlatformAdmin();
      const existing = await freshSession();

      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Beta Corp',
          firstAdmin: {
            email: existing.email,
            displayName: 'ignored',
            locale: 'en-US',
            timezone: 'UTC',
          },
        });
      createdOrgIds.push(res.body.id as string);

      expect(res.status).toBe(201);
      const user = await setupPrisma.user.findUnique({ where: { id: existing.userId } });
      expect(user?.organizationId).toBe(res.body.id);
    });

    it('returns 409 when the designated first admin already belongs to a different organization', async () => {
      const admin = await freshPlatformAdmin();
      const { enterpriseAdmin } = await freshOrg();

      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Gamma Corp',
          firstAdmin: {
            email: enterpriseAdmin.email,
            displayName: 'x',
            locale: 'en-US',
            timezone: 'UTC',
          },
        });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /v1/organizations/:id', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/organizations/11111111-1111-1111-1111-111111111111',
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 (not 403) for a plain MEMBER of the org — Part 6 requires that org's ENTERPRISE_ADMIN specifically", async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const memberSeed = await freshSession();
      await setupPrisma.user.update({
        where: { id: memberSeed.userId },
        data: { organizationId: orgId },
      });
      await setupPrisma.organizationMembership.create({
        data: { userId: memberSeed.userId, organizationId: orgId, orgRole: 'MEMBER' },
      });
      const member = await reLoginAs(memberSeed, async () => undefined);

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(res.status).toBe(404);
      void enterpriseAdmin;
    });

    it("returns 404 for a different organization's ENTERPRISE_ADMIN (no cross-tenant leak)", async () => {
      const { orgId } = await freshOrg();
      const { enterpriseAdmin: outsider } = await freshOrg();

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for a non-existent org, even for a platform admin', async () => {
      const admin = await freshPlatformAdmin();
      const res = await request(app.getHttpServer())
        .get('/v1/organizations/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(404);
    });

    it("happy path: that org's ENTERPRISE_ADMIN can read it, seeing themselves in the member list", async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orgId);
      expect(res.body.members).toEqual([
        expect.objectContaining({ userId: enterpriseAdmin.userId, orgRole: 'ENTERPRISE_ADMIN' }),
      ]);
    });

    it('happy path: a platform admin can read any organization', async () => {
      const { orgId } = await freshOrg();
      const admin = await freshPlatformAdmin();

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/organizations/:id/members', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/organizations/11111111-1111-1111-1111-111111111111/members')
        .send({ members: [] });
      expect(res.status).toBe(401);
    });

    it('returns 404 for an unauthorized caller', async () => {
      const { orgId } = await freshOrg();
      const outsider = await freshSession();
      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({
          members: [
            { email: uniqueTestEmail(), displayName: 'X', locale: 'en-US', timezone: 'UTC' },
          ],
        });
      expect(res.status).toBe(404);
    });

    it('happy path: adds several members in one request (the CSV-bulk-import shape), all as MEMBER by default', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const emails = [uniqueTestEmail(), uniqueTestEmail(), uniqueTestEmail()];

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: emails.map((email) => ({
            email,
            displayName: 'Bulk Member',
            locale: 'en-US',
            timezone: 'UTC',
          })),
        });

      expect(res.status).toBe(201);
      expect(res.body.members).toHaveLength(3);
      expect(res.body.members.every((m: { orgRole: string }) => m.orgRole === 'MEMBER')).toBe(true);

      const rows = await setupPrisma.organizationMembership.findMany({
        where: { organizationId: orgId },
      });
      expect(rows).toHaveLength(4); // the enterprise admin + 3 bulk members
    });

    it('bulk-import atomicity: one member already belonging to a different org rolls back the entire batch — no partial import', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const { enterpriseAdmin: alreadyElsewhere } = await freshOrg();
      const freshEmail = uniqueTestEmail();

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            {
              email: freshEmail,
              displayName: 'Should Not Persist',
              locale: 'en-US',
              timezone: 'UTC',
            },
            {
              email: alreadyElsewhere.email,
              displayName: 'Conflict',
              locale: 'en-US',
              timezone: 'UTC',
            },
          ],
        });

      expect(res.status).toBe(409);
      const partialUser = await setupPrisma.user.findUnique({ where: { email: freshEmail } });
      expect(partialUser).toBeNull(); // proves the first member's creation was rolled back, not left half-applied
    });
  });

  describe('DELETE /v1/organizations/:id/members/:userId', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/v1/organizations/11111111-1111-1111-1111-111111111111/members/22222222-2222-2222-2222-222222222222',
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 for an unauthorized caller', async () => {
      const { orgId } = await freshOrg();
      const outsider = await freshSession();
      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/11111111-1111-1111-1111-111111111111`)
        .set('Authorization', `Bearer ${outsider.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when the target user is not a member of that org', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const notAMember = await freshSession();
      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${notAMember.userId}`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('happy path: removes a non-last member, clearing their User.organizationId', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const memberEmail = uniqueTestEmail();
      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            { email: memberEmail, displayName: 'To Remove', locale: 'en-US', timezone: 'UTC' },
          ],
        });
      const memberId = addRes.body.members[0].userId as string;

      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);

      expect(res.status).toBe(204);
      const membership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
      });
      expect(membership).toBeNull();
      const user = await setupPrisma.user.findUnique({ where: { id: memberId } });
      expect(user?.organizationId).toBeNull();
    });

    it("negative example (Part 9, defense-in-depth trigger + application layer): removing the org's last ENTERPRISE_ADMIN is blocked with 409", async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();

      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${enterpriseAdmin.userId}`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);

      expect(res.status).toBe(409);
      const membership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: enterpriseAdmin.userId, organizationId: orgId } },
      });
      expect(membership).not.toBeNull();
    });

    it('allows removing an ENTERPRISE_ADMIN when a second one exists', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const secondAdminEmail = uniqueTestEmail();
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            {
              email: secondAdminEmail,
              displayName: 'Second Admin',
              locale: 'en-US',
              timezone: 'UTC',
            },
          ],
          orgRole: 'ENTERPRISE_ADMIN',
        });

      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${enterpriseAdmin.userId}`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);

      expect(res.status).toBe(204);
    });

    /**
     * E2 final acceptance review, finding F1: `removeMember` never bumped
     * `User.tokensValidAfter`, so a removed `ENTERPRISE_ADMIN`'s existing
     * access token kept working — both for reading the org and for
     * member-management actions — until its own natural 15-minute expiry.
     * This proves the fix the same way `users.e2e-spec.ts`'s E2-T28 tests
     * prove session revocation: capture a real token, act, then reuse the
     * *same* token and assert it now fails — not merely that the DELETE
     * itself returned 204.
     */
    it(
      'E2 acceptance remediation (F1): removing an ENTERPRISE_ADMIN invalidates their existing access token for both organization ' +
        'resource access and member-management access — but does not fully log them out (refresh still works and mints a correctly-scoped token)',
      async () => {
        const { orgId, enterpriseAdmin: admin1 } = await freshOrg();
        const admin2Seed = await freshSession();
        await request(app.getHttpServer())
          .post(`/v1/organizations/${orgId}/members`)
          .set('Authorization', `Bearer ${admin1.accessToken}`)
          .send({
            members: [
              {
                email: admin2Seed.email,
                displayName: 'Second Admin',
                locale: 'en-US',
                timezone: 'UTC',
              },
            ],
            orgRole: 'ENTERPRISE_ADMIN',
          });
        const admin2 = await reLoginAs(admin2Seed, async () => undefined);
        const preRemovalAccessToken = admin2.accessToken;
        const preRemovalRefreshToken = admin2.refreshToken;

        // `isTokenStale` compares `jwt.iat` (integer seconds, per the JWT
        // spec — there is no sub-second `iat`) against
        // `tokensValidAfter` floored to seconds (`auth.service.ts`'s
        // existing, previously-reviewed comparison, shared by every
        // `tokensValidAfter` writer — demotion, password reset, GDPR
        // erasure). Two events inside the same wall-clock second are
        // therefore fundamentally unorderable from `iat` alone — an
        // inherent one-second-granularity property of the mechanism, not
        // specific to this fix. A real removal happens well over a second
        // after the token that gets invalidated; this wait makes the test
        // deterministic instead of depending on incidental HTTP round-trip
        // latency to cross a second boundary.
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const removeRes = await request(app.getHttpServer())
          .delete(`/v1/organizations/${orgId}/members/${admin2.userId}`)
          .set('Authorization', `Bearer ${admin1.accessToken}`);
        expect(removeRes.status).toBe(204);

        // Organization resource access — same still-cryptographically-valid token, reused.
        const orgReadAfter = await request(app.getHttpServer())
          .get(`/v1/organizations/${orgId}`)
          .set('Authorization', `Bearer ${preRemovalAccessToken}`);
        expect(orgReadAfter.status).toBe(401);

        // Member-management access — same token, a different (write) org endpoint.
        const memberWriteAfter = await request(app.getHttpServer())
          .post(`/v1/organizations/${orgId}/members`)
          .set('Authorization', `Bearer ${preRemovalAccessToken}`)
          .send({
            members: [
              { email: uniqueTestEmail(), displayName: 'X', locale: 'en-US', timezone: 'UTC' },
            ],
          });
        expect(memberWriteAfter.status).toBe(401);

        // Token/session invalidation is general, not merely org-scoped — the
        // same token also fails against a completely unrelated authenticated route.
        const meAfter = await request(app.getHttpServer())
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${preRemovalAccessToken}`);
        expect(meAfter.status).toBe(401);

        // Deliberately NOT a full logout (unlike DELETE .../sessions/:id or
        // POST /v1/auth/logout, E2-T28): the refresh token survives, and
        // refreshing mints a new access token whose claims correctly reflect
        // no more org membership.
        const refreshRes = await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', `refreshToken=${preRemovalRefreshToken}`);
        expect(refreshRes.status).toBe(200);
        const newAccessToken = refreshRes.body.accessToken as string;

        const meWithNewToken = await request(app.getHttpServer())
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${newAccessToken}`);
        expect(meWithNewToken.status).toBe(200);

        // The refreshed token's claims are genuinely re-derived (organizationId: null) —
        // it can no longer manage the org either, this time via ordinary authorization (404), not staleness (401).
        const orgReadWithNewToken = await request(app.getHttpServer())
          .get(`/v1/organizations/${orgId}`)
          .set('Authorization', `Bearer ${newAccessToken}`);
        expect(orgReadWithNewToken.status).toBe(404);
      },
    );

    it('E2 acceptance remediation (F1): the same invalidation applies to a plain (non-admin) MEMBER removal, not just ENTERPRISE_ADMIN', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const memberSeed = await freshSession();
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            {
              email: memberSeed.email,
              displayName: 'Plain Member',
              locale: 'en-US',
              timezone: 'UTC',
            },
          ],
        });
      const member = await reLoginAs(memberSeed, async () => undefined);

      // See the sibling ENTERPRISE_ADMIN test above for why this wait is
      // here: `isTokenStale`'s second-granularity `iat` comparison can't
      // order two events inside the same wall-clock second.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const removeRes = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${member.userId}`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);
      expect(removeRes.status).toBe(204);

      const meAfter = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(meAfter.status).toBe(401);
    });

    it('concurrent removal of the same member: exactly one request succeeds (204), the other fails cleanly (404), never a 500', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const memberEmail = uniqueTestEmail();
      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            { email: memberEmail, displayName: 'Racing Removal', locale: 'en-US', timezone: 'UTC' },
          ],
        });
      const memberId = addRes.body.members[0].userId as string;

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/v1/organizations/${orgId}/members/${memberId}`)
          .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`),
        request(app.getHttpServer())
          .delete(`/v1/organizations/${orgId}/members/${memberId}`)
          .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([204, 404]);

      const membership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
      });
      expect(membership).toBeNull();
    });
  });
});
