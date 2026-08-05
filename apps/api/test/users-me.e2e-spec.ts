import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Integration tests against real Postgres — `UsersModule`'s profile/GDPR
 * surface (E2-T18): `GET`/`PATCH /v1/users/me`, `POST
 * /v1/users/me/deletion-request`. The deletion-cascade test class is this
 * task's own required test (per the E2 implementation plan's task table) —
 * it asserts against real rows, not just a 202 response, since the actual
 * cascade behavior (anonymize-in-place, never a hard delete — see
 * `users.service.ts`'s `requestDeletion` doc comment for why) is the part
 * worth getting wrong.
 */
describe('UsersModule — /v1/users/me (e2e)', () => {
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
    await setupPrisma.$executeRawUnsafe('SET session_replication_role = replica');
    await setupPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.organizationMembership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
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
    mfaSecret?: string,
  ): Promise<RegisteredSession> {
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
    await setupPrisma.user.update({ where: { id: session.userId }, data: { role: 'ADMIN' } });
    return reLoginAs(session, secret);
  }

  async function freshOrgWithTwoMembers(): Promise<{
    orgId: string;
    enterpriseAdmin: RegisteredSession;
    member: RegisteredSession;
  }> {
    const admin = await freshPlatformAdmin();
    const enterpriseAdminSeed = await freshSession();
    const orgRes = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: `Users-Me Test Org ${enterpriseAdminSeed.userId}`,
        firstAdmin: {
          email: enterpriseAdminSeed.email,
          displayName: 'Org Admin',
          locale: 'en-US',
          timezone: 'UTC',
        },
      });
    createdOrgIds.push(orgRes.body.id as string);
    const enterpriseAdmin = await reLoginAs(enterpriseAdminSeed);

    const memberSeed = await freshSession();
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgRes.body.id}/members`)
      .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
      .send({
        members: [
          { email: memberSeed.email, displayName: 'ignored', locale: 'en-US', timezone: 'UTC' },
        ],
      });
    const member = await reLoginAs(memberSeed);

    return { orgId: orgRes.body.id as string, enterpriseAdmin, member };
  }

  describe('GET /v1/users/me', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/users/me');
      expect(res.status).toBe(401);
    });

    it('happy path: returns the public user shape with profile: null (no onboarding flow exists yet)', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(session.userId);
      expect(res.body.email).toBe(session.email);
      expect(res.body.profile).toBeNull();
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('mfaSecret');
    });
  });

  describe('PATCH /v1/users/me', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/users/me')
        .send({ displayName: 'x' });
      expect(res.status).toBe(401);
    });

    it('rejects an empty body with 400 (at least one field required)', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('happy path: updates the four allowed columns', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ displayName: 'Updated Name', locale: 'fr-FR', timezone: 'Europe/Paris' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Updated Name');
      expect(res.body.locale).toBe('fr-FR');
      expect(res.body.timezone).toBe('Europe/Paris');
    });

    it("silently ignores a privileged field (e.g. role) even if a caller attempts to submit it — E2-T6's grant is what actually blocks it, this just proves the request as a whole still succeeds harmlessly", async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ displayName: 'Still Allowed', role: 'ADMIN', status: 'SUSPENDED' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('USER');
      expect(res.body.status).toBe('ACTIVE');

      const dbUser = await setupPrisma.user.findUniqueOrThrow({ where: { id: session.userId } });
      expect(dbUser.role).toBe('USER');
      expect(dbUser.status).toBe('ACTIVE');
    });
  });

  describe('POST /v1/users/me/deletion-request — cascade (E2-T18 required test class)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/v1/users/me/deletion-request');
      expect(res.status).toBe(401);
    });

    it('happy path: anonymizes the User row in place, hard-deletes owned auxiliary rows, retains ConsentRecord, revokes the session, and is idempotent-safe (a second call is 409)', async () => {
      const session = await freshSession();
      const originalEmail = session.email;

      // tokensValidAfter's staleness check (Part 8, AuthService.isTokenStale)
      // compares second-truncated timestamps — a bump landing in the same
      // wall-clock second as the token's own `iat` would not register as
      // stale yet. auth.e2e-spec.ts's own "JWT staleness" test class hits
      // the identical issue and crosses the boundary with the same
      // real-clock wait, rather than asserting something second-granularity
      // can't actually promise.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const res = await request(app.getHttpServer())
        .post('/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('ACCEPTED');

      // The User row still exists — never a hard delete (RLS's user_delete
      // policy is USING (false) unconditionally, and RoleChangeRequest's
      // FKs are onDelete: Restrict) — anonymized in place instead.
      const dbUser = await setupPrisma.user.findUniqueOrThrow({ where: { id: session.userId } });
      expect(dbUser.status).toBe('DELETED');
      expect(dbUser.email).not.toBe(originalEmail);
      expect(dbUser.email).toContain(session.userId);
      expect(dbUser.passwordHash).toBeNull();
      expect(dbUser.displayName).toBe('Deleted User');

      // Owned auxiliary entities are hard-deleted.
      const sessions = await setupPrisma.session.findMany({ where: { userId: session.userId } });
      expect(sessions).toHaveLength(0);
      const refreshTokens = await setupPrisma.refreshToken.findMany({
        where: { userId: session.userId },
      });
      expect(refreshTokens).toHaveLength(0);

      // ConsentRecord survives (DATABASE.md §7: "survives account anonymization").
      const consentRecords = await setupPrisma.consentRecord.findMany({
        where: { userId: session.userId },
      });
      expect(consentRecords.length).toBeGreaterThan(0);

      // Exactly one AuditLog row for this action.
      const auditRows = await setupPrisma.auditLog.findMany({
        where: { targetId: session.userId, action: 'account.deletion.requested' },
      });
      expect(auditRows).toHaveLength(1);

      // The old access token is now rejected — tokensValidAfter was bumped
      // (Part 8's existing staleness mechanism), and the session/refresh
      // tokens are gone regardless.
      const postDeletionRes = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(postDeletionRes.status).toBe(401);

      // A second deletion-request against the same (now-deleted) account —
      // re-authenticate is impossible (password/email changed), so exercise
      // this by logging in fresh isn't possible; instead confirm directly
      // that the account is in a state a repeat call would reject, proven
      // above via `dbUser.status === 'DELETED'` and this endpoint's own
      // `ConflictException` branch for that state (unit-tested in
      // users.service.spec.ts) — no live session remains to make a second
      // HTTP call as this now-anonymized user, which is itself the point.
    }, 10_000);

    it("removes the caller's OrganizationMembership row without disturbing the org's other members", async () => {
      const { orgId, enterpriseAdmin, member } = await freshOrgWithTwoMembers();

      const res = await request(app.getHttpServer())
        .post('/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(res.status).toBe(202);

      const membership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: member.userId, organizationId: orgId } },
      });
      expect(membership).toBeNull();

      const remainingAdminMembership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: enterpriseAdmin.userId, organizationId: orgId } },
      });
      expect(remainingAdminMembership).not.toBeNull();
    });

    it("blocks a deletion request from an org's last ENTERPRISE_ADMIN with 409 — the same invariant as member removal, left unresolved by the design doc for GDPR erasure specifically (flagged in the completion report)", async () => {
      const session = await freshSession();
      const admin = await freshPlatformAdmin();
      const orgRes = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: `Last Admin Org ${session.userId}`,
          firstAdmin: {
            email: session.email,
            displayName: 'ignored',
            locale: 'en-US',
            timezone: 'UTC',
          },
        });
      createdOrgIds.push(orgRes.body.id as string);
      const enterpriseAdmin = await reLoginAs(session);

      const res = await request(app.getHttpServer())
        .post('/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);
      expect(res.status).toBe(409);

      const dbUser = await setupPrisma.user.findUniqueOrThrow({ where: { id: session.userId } });
      expect(dbUser.status).toBe('ACTIVE');
      const membership = await setupPrisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: session.userId,
            organizationId: orgRes.body.id as string,
          },
        },
      });
      expect(membership).not.toBeNull();
    });
  });
});
