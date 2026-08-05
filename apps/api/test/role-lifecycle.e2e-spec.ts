import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { Body, Controller, Inject, Post, UseGuards, type INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { APP_PRISMA_CLIENT, type AppPrismaClient } from '../src/database/index.js';
import {
  registerAndLogin,
  TEST_PASSWORD,
  uniqueTestEmail,
  type RegisteredSession,
} from './helpers/auth-flow.js';

// ts-jest transpiles this file to CommonJS (apps/api's jest config) —
// `__dirname` is CJS's own native global, no ESM `import.meta.url`
// derivation needed here (unlike the app's real runtime, which is ESM).
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * A throwaway, test-only controller — same discipline as
 * `tenant-rls.e2e-spec.ts`'s `RlsProbeController`: calls the real
 * `SECURITY DEFINER` governance functions (Part 9C) through the real
 * `AuthGuard('jwt')` + `TenantContextInterceptor` pipeline, so
 * `app.current_user_id` is genuinely set from the caller's own verified
 * JWT — but *not* through `role-lifecycle.service.ts`, which never lets a
 * client supply an arbitrary `approverId`/`actorId` in the first place.
 * That's the point: the real endpoints structurally can't exercise Part
 * 9C's Finding-3 caller-identity check or Finding-4's independent
 * actor-authorization check, since the service always passes the
 * authenticated caller's own id — this controller is what actually lets a
 * test claim to *be* a different (real, otherwise-eligible) user, proving
 * the database function itself — not `RolesGuard`, not the service layer —
 * is what rejects the mismatch.
 */
@Controller('test-only/governance-probe')
@UseGuards(AuthGuard('jwt'))
class GovernanceProbeController {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: AppPrismaClient) {}

  @Post('approve-role-change')
  approveRoleChange(@Body() body: { requestId: string; approverId: string }) {
    return this.appPrisma
      .$executeRaw`SELECT approve_role_change(${body.requestId}::uuid, ${body.approverId}::uuid, true)`;
  }

  @Post('set-org-role')
  setOrgRole(@Body() body: { membershipId: string; newOrgRole: string; actorId: string }) {
    return this.appPrisma
      .$executeRaw`SELECT set_org_role(${body.membershipId}::uuid, ${body.newOrgRole}::text, ${body.actorId}::uuid)`;
  }
}

/**
 * Integration tests against real Postgres — `role-lifecycle.service.ts`
 * (E2-T16), calling the real `approve_role_change()`/`set_org_role()`
 * `SECURITY DEFINER` functions (E2-T5). Two required test classes (Part
 * 16), both in this file: the role-lifecycle class (single-party
 * auto-approval, two-person approval, org-role promotion/demotion) and
 * the governance-function concurrency/authorization class (E2-T24 —
 * every scenario the fourth targeted review traced by hand, reproduced as
 * a real, running test: the concurrent last-admin/last-org-admin races,
 * the *sequential* zero-admin exploit the third review originally found,
 * and both functions' caller-identity/actor-authorization checks proven
 * independent of `RolesGuard`), plus the bootstrap-CLI end-to-end exercise
 * T16's acceptance criteria require.
 */
describe('Role lifecycle (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [GovernanceProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    const orgIds = createdOrgIds.filter((id): id is string => Boolean(id));
    await setupPrisma.$executeRawUnsafe('SET session_replication_role = replica');
    await setupPrisma.roleChangeRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    await setupPrisma.organizationMembership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
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

  async function freshOrg(): Promise<{ orgId: string; enterpriseAdmin: RegisteredSession }> {
    const admin = await freshPlatformAdmin();
    const seed = await freshSession();
    const res = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: `RL Test Org ${seed.userId}`,
        firstAdmin: {
          email: seed.email,
          displayName: 'Org Admin',
          locale: 'en-US',
          timezone: 'UTC',
        },
      });
    createdOrgIds.push(res.body.id as string);
    const enterpriseAdmin = await reLoginAs(seed);
    return { orgId: res.body.id as string, enterpriseAdmin };
  }

  describe('POST /v1/users/:id/role-change-requests', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/users/11111111-1111-1111-1111-111111111111/role-change-requests')
        .send({ toRole: 'TEACHER' });
      expect(res.status).toBe(401);
    });

    it('rejects a non-ADMIN caller with 403', async () => {
      const { accessToken } = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/users/11111111-1111-1111-1111-111111111111/role-change-requests')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ toRole: 'TEACHER' });
      expect(res.status).toBe(403);
    });

    it('single-party: USER -> TEACHER is auto-approved immediately, and the target role changes right away', async () => {
      const admin = await freshPlatformAdmin();
      const target = await freshSession();

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ toRole: 'TEACHER' });
      createdRequestIds.push(res.body.id as string);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.fromRole).toBe('USER');
      expect(res.body.approvedBy).toBe(admin.userId);

      const updatedTarget = await setupPrisma.user.findUnique({ where: { id: target.userId } });
      expect(updatedTarget?.role).toBe('TEACHER');
    });

    it('two-person: promoting to ADMIN stays PENDING and does not change the role yet', async () => {
      const admin = await freshPlatformAdmin();
      const target = await freshSession();

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ toRole: 'ADMIN' });
      createdRequestIds.push(res.body.id as string);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');

      const updatedTarget = await setupPrisma.user.findUnique({ where: { id: target.userId } });
      expect(updatedTarget?.role).toBe('USER');
    });

    it('returns 409 when the target already has the requested role', async () => {
      const admin = await freshPlatformAdmin();
      const target = await freshSession();

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ toRole: 'USER' });

      expect(res.status).toBe(409);
    });

    it('returns 404 for a non-existent target user', async () => {
      const admin = await freshPlatformAdmin();
      const res = await request(app.getHttpServer())
        .post('/v1/users/11111111-1111-1111-1111-111111111111/role-change-requests')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ toRole: 'TEACHER' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/users/:id/role-change-requests/:requestId/approve', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post(
        '/v1/users/11111111-1111-1111-1111-111111111111/role-change-requests/22222222-2222-2222-2222-222222222222/approve',
      );
      expect(res.status).toBe(401);
    });

    it("an ADMIN cannot approve their own request (409, per approve_role_change()'s own require_different_approver check)", async () => {
      const admin = await freshPlatformAdmin();
      const target = await freshSession();
      const initiateRes = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ toRole: 'ADMIN' });
      createdRequestIds.push(initiateRes.body.id as string);

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests/${initiateRes.body.id}/approve`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(409);
    });

    it('happy path: a different ADMIN approves an ADMIN-involving request, and the role change takes effect', async () => {
      const requester = await freshPlatformAdmin();
      const approver = await freshPlatformAdmin();
      const target = await freshSession();

      const initiateRes = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${requester.accessToken}`)
        .send({ toRole: 'ADMIN' });
      createdRequestIds.push(initiateRes.body.id as string);

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests/${initiateRes.body.id}/approve`)
        .set('Authorization', `Bearer ${approver.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');

      const updatedTarget = await setupPrisma.user.findUnique({ where: { id: target.userId } });
      expect(updatedTarget?.role).toBe('ADMIN');
      // Demote them back immediately so they don't inflate the "remaining
      // admins" count for later tests/other concurrent suites.
      await setupPrisma.user.update({ where: { id: target.userId }, data: { role: 'USER' } });
    });

    it('returns 409 when approving an already-resolved request', async () => {
      const requester = await freshPlatformAdmin();
      const approver1 = await freshPlatformAdmin();
      const approver2 = await freshPlatformAdmin();
      const target = await freshSession();

      const initiateRes = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${requester.accessToken}`)
        .send({ toRole: 'ADMIN' });
      createdRequestIds.push(initiateRes.body.id as string);

      await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests/${initiateRes.body.id}/approve`)
        .set('Authorization', `Bearer ${approver1.accessToken}`);

      const secondAttempt = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests/${initiateRes.body.id}/approve`)
        .set('Authorization', `Bearer ${approver2.accessToken}`);

      expect(secondAttempt.status).toBe(409);
      await setupPrisma.user.update({ where: { id: target.userId }, data: { role: 'USER' } });
    });
  });

  describe('PATCH /v1/organizations/:id/members/:userId/role', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).patch(
        '/v1/organizations/11111111-1111-1111-1111-111111111111/members/22222222-2222-2222-2222-222222222222/role',
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 for an unauthorized caller', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const outsider = await freshSession();
      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${enterpriseAdmin.userId}/role`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ orgRole: 'MEMBER' });
      expect(res.status).toBe(404);
    });

    it('happy path: the org ENTERPRISE_ADMIN promotes a MEMBER to ENTERPRISE_ADMIN', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const memberEmail = uniqueTestEmail();
      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            { email: memberEmail, displayName: 'Promotee', locale: 'en-US', timezone: 'UTC' },
          ],
        });
      const memberId = addRes.body.members[0].userId as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${memberId}/role`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({ orgRole: 'ENTERPRISE_ADMIN' });

      expect(res.status).toBe(204);
      const membership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: memberId, organizationId: orgId } },
      });
      expect(membership?.orgRole).toBe('ENTERPRISE_ADMIN');
    });

    it('happy path: a platform admin can act cross-org', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const platformAdmin = await freshPlatformAdmin();
      const memberEmail = uniqueTestEmail();
      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [
            { email: memberEmail, displayName: 'Promotee2', locale: 'en-US', timezone: 'UTC' },
          ],
        });
      const memberId = addRes.body.members[0].userId as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${memberId}/role`)
        .set('Authorization', `Bearer ${platformAdmin.accessToken}`)
        .send({ orgRole: 'ENTERPRISE_ADMIN' });

      expect(res.status).toBe(204);
    });

    it("negative example: demoting the org's last remaining ENTERPRISE_ADMIN is blocked with 409", async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${enterpriseAdmin.userId}/role`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({ orgRole: 'MEMBER' });

      expect(res.status).toBe(409);
      const membership = await setupPrisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: enterpriseAdmin.userId, organizationId: orgId } },
      });
      expect(membership?.orgRole).toBe('ENTERPRISE_ADMIN');
    });

    it('returns 404 when the target is not a member of that org', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const outsider = await freshSession();
      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${outsider.userId}/role`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({ orgRole: 'ENTERPRISE_ADMIN' });
      expect(res.status).toBe(404);
    });
  });

  /**
   * Part 9C's own remediation text, verbatim: "With exactly 2 platform
   * ADMINs, two concurrently-issued demotions that would together leave
   * zero — the second call raises cannot_demote_last_platform_admin,
   * evaluated against the first call's committed state, not stale data
   * ... a control case proving two different orgs' concurrent calls do
   * not block each other."
   */
  describe('Governance-function concurrency/authorization test class (Part 16)', () => {
    it(
      'with exactly 2 admins, two concurrent self-demotion approvals (cross-approving each other) — the invariant always holds ' +
        "(never zero remaining admins), even though the *loser*'s exact status code is race-order-dependent: it either loses the " +
        'advisory-lock race and sees `cannot_demote_last_platform_admin` (409), or — since the only possible approver for either ' +
        "request, with exactly 2 admins, is the other admin — the winner's own demotion can make the loser's own approver-of-record " +
        "no longer ADMIN, failing that request's `approver_not_authorized` check (403) instead. Both are correct, race-order-dependent " +
        'outcomes of the same safety property; the org-scoped test below isolates the count check alone, without this extra dimension.',
      async () => {
        const adminA = await freshPlatformAdmin();
        const adminB = await freshPlatformAdmin();

        const requestA = await request(app.getHttpServer())
          .post(`/v1/users/${adminA.userId}/role-change-requests`)
          .set('Authorization', `Bearer ${adminA.accessToken}`)
          .send({ toRole: 'USER' });
        createdRequestIds.push(requestA.body.id as string);
        const requestB = await request(app.getHttpServer())
          .post(`/v1/users/${adminB.userId}/role-change-requests`)
          .set('Authorization', `Bearer ${adminB.accessToken}`)
          .send({ toRole: 'USER' });
        createdRequestIds.push(requestB.body.id as string);

        // A approves B's demotion; B approves A's demotion — fired concurrently.
        const [approveB, approveA] = await Promise.all([
          request(app.getHttpServer())
            .post(`/v1/users/${adminB.userId}/role-change-requests/${requestB.body.id}/approve`)
            .set('Authorization', `Bearer ${adminA.accessToken}`),
          request(app.getHttpServer())
            .post(`/v1/users/${adminA.userId}/role-change-requests/${requestA.body.id}/approve`)
            .set('Authorization', `Bearer ${adminB.accessToken}`),
        ]);

        // Exactly one call succeeds — the core safety property under test.
        const statuses = [approveB.status, approveA.status];
        expect(statuses.filter((s) => s === 200)).toHaveLength(1);
        expect(statuses.filter((s) => s === 200 || s === 409 || s === 403)).toHaveLength(2);

        const finalAdminA = await setupPrisma.user.findUnique({ where: { id: adminA.userId } });
        const finalAdminB = await setupPrisma.user.findUnique({ where: { id: adminB.userId } });
        const remainingAdmins = [finalAdminA?.role, finalAdminB?.role].filter((r) => r === 'ADMIN');
        // Exactly one of the two survives as ADMIN — never zero.
        expect(remainingAdmins).toHaveLength(1);
      },
    );

    it("with exactly 2 ENTERPRISE_ADMINs in one org, two concurrent self-demotions via PATCH .../role — the second, evaluated against the first's committed state, is blocked with exactly 409 (no approver-eligibility complication here — each caller only ever asserts their own, untouched membership)", async () => {
      const { orgId, enterpriseAdmin: admin1 } = await freshOrg();
      // Registered normally (a real password) rather than bulk-added, so
      // this fixture can actually log in — a bulk-added member has no
      // password at all (T15's flagged gap: no invite/set-password
      // endpoint exists yet) and attaching an *existing* registered user
      // via `POST .../members` is exactly the "existing, org-less user"
      // path E2-T15 already covers.
      const admin2Seed = await freshSession();
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${admin1.accessToken}`)
        .send({
          members: [
            { email: admin2Seed.email, displayName: 'ignored', locale: 'en-US', timezone: 'UTC' },
          ],
          orgRole: 'ENTERPRISE_ADMIN',
        });
      const admin2 = await reLoginAs(admin2Seed);

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/v1/organizations/${orgId}/members/${admin1.userId}/role`)
          .set('Authorization', `Bearer ${admin1.accessToken}`)
          .send({ orgRole: 'MEMBER' }),
        request(app.getHttpServer())
          .patch(`/v1/organizations/${orgId}/members/${admin2.userId}/role`)
          .set('Authorization', `Bearer ${admin2.accessToken}`)
          .send({ orgRole: 'MEMBER' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([204, 409]);

      const remainingAdmins = await setupPrisma.organizationMembership.count({
        where: { organizationId: orgId, orgRole: 'ENTERPRISE_ADMIN' },
      });
      expect(remainingAdmins).toBe(1);
    });

    it("control case: two different organizations' concurrent last-admin-adjacent role changes do not block each other", async () => {
      const org1 = await freshOrg();
      const org2 = await freshOrg();
      const secondAdmin1Email = uniqueTestEmail();
      const secondAdmin2Email = uniqueTestEmail();

      await request(app.getHttpServer())
        .post(`/v1/organizations/${org1.orgId}/members`)
        .set('Authorization', `Bearer ${org1.enterpriseAdmin.accessToken}`)
        .send({
          members: [
            { email: secondAdmin1Email, displayName: 'Second1', locale: 'en-US', timezone: 'UTC' },
          ],
          orgRole: 'ENTERPRISE_ADMIN',
        });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${org2.orgId}/members`)
        .set('Authorization', `Bearer ${org2.enterpriseAdmin.accessToken}`)
        .send({
          members: [
            { email: secondAdmin2Email, displayName: 'Second2', locale: 'en-US', timezone: 'UTC' },
          ],
          orgRole: 'ENTERPRISE_ADMIN',
        });

      // Each org's original ENTERPRISE_ADMIN demotes themselves to MEMBER,
      // concurrently, in two unrelated orgs — a second admin exists in
      // each org independently, so both should succeed.
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/v1/organizations/${org1.orgId}/members/${org1.enterpriseAdmin.userId}/role`)
          .set('Authorization', `Bearer ${org1.enterpriseAdmin.accessToken}`)
          .send({ orgRole: 'MEMBER' }),
        request(app.getHttpServer())
          .patch(`/v1/organizations/${org2.orgId}/members/${org2.enterpriseAdmin.userId}/role`)
          .set('Authorization', `Bearer ${org2.enterpriseAdmin.accessToken}`)
          .send({ orgRole: 'MEMBER' }),
      ]);

      expect(res1.status).toBe(204);
      expect(res2.status).toBe(204);
    });

    it(
      'sequential exploit (fourth targeted review, Check 1 — "the actual zero-admin exploit the third review demonstrated"): ' +
        'with exactly 2 admins, A demotes B (approved by A itself is impossible — approved by a third admin), then a SECOND ' +
        'request demoting A, approved by the now-demoted B, is rejected at the approver check before the count logic ever runs',
      async () => {
        const adminA = await freshPlatformAdmin();
        const adminB = await freshPlatformAdmin();
        const thirdAdmin = await freshPlatformAdmin(); // approves the first demotion, so it isn't racing/self-referential

        const requestDemoteB = await request(app.getHttpServer())
          .post(`/v1/users/${adminB.userId}/role-change-requests`)
          .set('Authorization', `Bearer ${adminA.accessToken}`)
          .send({ toRole: 'USER' });
        createdRequestIds.push(requestDemoteB.body.id as string);
        const approveDemoteB = await request(app.getHttpServer())
          .post(`/v1/users/${adminB.userId}/role-change-requests/${requestDemoteB.body.id}/approve`)
          .set('Authorization', `Bearer ${thirdAdmin.accessToken}`);
        expect(approveDemoteB.status).toBe(200);

        // B is no longer ADMIN. A second request demoting A, "approved" by
        // B — B's own JWT is still cryptographically valid (role changes
        // bump tokensValidAfter for *B's own future requests*, not for
        // this one already-issued token being used as the approver's
        // credential here), so this reaches approve_role_change() at all —
        // exactly the scenario the function's own approver_not_authorized
        // check (Finding 4) exists to catch, independent of RolesGuard.
        const requestDemoteA = await request(app.getHttpServer())
          .post(`/v1/users/${adminA.userId}/role-change-requests`)
          .set('Authorization', `Bearer ${thirdAdmin.accessToken}`)
          .send({ toRole: 'USER' });
        createdRequestIds.push(requestDemoteA.body.id as string);
        const approveDemoteA = await request(app.getHttpServer())
          .post(`/v1/users/${adminA.userId}/role-change-requests/${requestDemoteA.body.id}/approve`)
          .set('Authorization', `Bearer ${adminB.accessToken}`);

        expect(approveDemoteA.status).toBeGreaterThanOrEqual(400);
        const finalAdminA = await setupPrisma.user.findUnique({ where: { id: adminA.userId } });
        expect(finalAdminA?.role).toBe('ADMIN');
      },
    );

    it(
      'caller_identity_mismatch (Part 9C Finding 3, fourth targeted review Check 3 — "malicious caller supplies another ' +
        "user's ID\"): approve_role_change() rejects a call whose approverId doesn't match the authenticated caller, even " +
        'naming a real, otherwise-eligible ADMIN — role-lifecycle.service.ts never lets a client construct this call ' +
        "through the real endpoint; this proves the function's own defense, not just the service layer's, holds",
      async () => {
        const requester = await freshPlatformAdmin();
        const authenticatedCaller = await freshPlatformAdmin();
        const impersonatedApprover = await freshPlatformAdmin(); // real, eligible ADMIN — NOT who is actually calling
        const target = await freshSession();

        const initiateRes = await request(app.getHttpServer())
          .post(`/v1/users/${target.userId}/role-change-requests`)
          .set('Authorization', `Bearer ${requester.accessToken}`)
          .send({ toRole: 'ADMIN' });
        createdRequestIds.push(initiateRes.body.id as string);

        const res = await request(app.getHttpServer())
          .post('/v1/test-only/governance-probe/approve-role-change')
          .set('Authorization', `Bearer ${authenticatedCaller.accessToken}`)
          .send({ requestId: initiateRes.body.id, approverId: impersonatedApprover.userId });

        expect(res.status).toBeGreaterThanOrEqual(400);
        const stillPending = await setupPrisma.roleChangeRequest.findUnique({
          where: { id: initiateRes.body.id },
        });
        expect(stillPending?.status).toBe('PENDING');
      },
    );

    it(
      'caller_identity_mismatch (Part 9C Finding 3): set_org_role() rejects a call whose actorId does not match the ' +
        "authenticated caller, even naming that org's real ENTERPRISE_ADMIN",
      async () => {
        const { orgId, enterpriseAdmin } = await freshOrg();
        const authenticatedCaller = await freshSession(); // unrelated to this org entirely
        const targetSeed = await freshSession();
        await request(app.getHttpServer())
          .post(`/v1/organizations/${orgId}/members`)
          .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
          .send({
            members: [
              { email: targetSeed.email, displayName: 'ignored', locale: 'en-US', timezone: 'UTC' },
            ],
          });
        const targetMembership = await setupPrisma.organizationMembership.findUniqueOrThrow({
          where: { userId_organizationId: { userId: targetSeed.userId, organizationId: orgId } },
        });

        const res = await request(app.getHttpServer())
          .post('/v1/test-only/governance-probe/set-org-role')
          .set('Authorization', `Bearer ${authenticatedCaller.accessToken}`)
          .send({
            membershipId: targetMembership.id,
            newOrgRole: 'ENTERPRISE_ADMIN',
            actorId: enterpriseAdmin.userId,
          });

        expect(res.status).toBeGreaterThanOrEqual(400);
        const stillMember = await setupPrisma.organizationMembership.findUnique({
          where: { id: targetMembership.id },
        });
        expect(stillMember?.orgRole).toBe('MEMBER');
      },
    );

    it(
      'actor_not_authorized_for_organization (Part 9C Finding 4, fourth targeted review Check 4 — "an application-middleware ' +
        'failure (a missing or buggy RolesGuard) cannot be bypassed"): set_org_role() independently rejects a caller whose ' +
        "own membership in that org is a plain MEMBER, not ENTERPRISE_ADMIN — the real PATCH endpoint's own RolesGuard-equivalent " +
        "check would already block this caller; this proves the database function doesn't merely trust that check either",
      async () => {
        const { orgId, enterpriseAdmin } = await freshOrg();
        const plainMemberSeed = await freshSession();
        await request(app.getHttpServer())
          .post(`/v1/organizations/${orgId}/members`)
          .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
          .send({
            members: [
              {
                email: plainMemberSeed.email,
                displayName: 'ignored',
                locale: 'en-US',
                timezone: 'UTC',
              },
            ],
          });
        const plainMember = await reLoginAs(plainMemberSeed);

        const targetSeed = await freshSession();
        await request(app.getHttpServer())
          .post(`/v1/organizations/${orgId}/members`)
          .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
          .send({
            members: [
              { email: targetSeed.email, displayName: 'ignored', locale: 'en-US', timezone: 'UTC' },
            ],
          });
        const targetMembership = await setupPrisma.organizationMembership.findUniqueOrThrow({
          where: { userId_organizationId: { userId: targetSeed.userId, organizationId: orgId } },
        });

        const res = await request(app.getHttpServer())
          .post('/v1/test-only/governance-probe/set-org-role')
          .set('Authorization', `Bearer ${plainMember.accessToken}`)
          .send({
            membershipId: targetMembership.id,
            newOrgRole: 'ENTERPRISE_ADMIN',
            actorId: plainMember.userId,
          });

        expect(res.status).toBeGreaterThanOrEqual(400);
        const stillMember = await setupPrisma.organizationMembership.findUnique({
          where: { id: targetMembership.id },
        });
        expect(stillMember?.orgRole).toBe('MEMBER');
      },
    );
  });

  /**
   * "A fresh environment can produce its first working ADMIN account via
   * the bootstrap CLI (E2-T5), exercised end-to-end here" (T16's own
   * acceptance criteria). Runs the real CLI script as a child process —
   * the same command an operator would run — then proves the resulting
   * account genuinely cannot act until MFA-enrolled, and genuinely can
   * once it is, using it to perform a real privileged action with no
   * other admin involved anywhere in the chain.
   */
  describe('Bootstrap CLI, exercised end-to-end', () => {
    it('creates a working ADMIN account that is blocked pre-MFA and fully functional post-MFA', async () => {
      const email = uniqueTestEmail();
      const password = 'bootstrap horse battery staple';
      const secret = process.env.BOOTSTRAP_ADMIN_SECRET;
      expect(secret).toBeTruthy();

      execSync(
        `pnpm --filter @linguaai/database run bootstrap-admin -- --email ${email} --display-name "Bootstrap Admin" --password "${password}" --secret "${secret}"`,
        { cwd: REPO_ROOT, stdio: 'pipe' },
      );

      const created = await setupPrisma.user.findUniqueOrThrow({ where: { email } });
      createdUserIds.push(created.id);
      expect(created.role).toBe('ADMIN');
      expect(created.mfaEnrolled).toBe(false);
      expect(created.status).toBe('ACTIVE');

      // Not filtered by a specific action string: by the time this describe
      // block runs, many earlier tests in this same file have already
      // promoted users to ADMIN, so bootstrap-admin.ts's own
      // existingAdminCount check (E2-T17) legitimately sees other ADMINs
      // already present and may correctly classify this as an emergency
      // recovery rather than a fresh bootstrap — this test's own concern is
      // the CLI's pre/post-MFA gating mechanics, not which of the two valid
      // audit actions gets written.
      const bootstrapAuditLog = await setupPrisma.auditLog.findFirst({
        where: { targetId: created.id },
      });
      expect(bootstrapAuditLog?.actorType).toBe('SYSTEM');
      expect(['user.bootstrap_admin_created', 'user.emergency_admin_recovery']).toContain(
        bootstrapAuditLog?.action,
      );

      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password });
      const accessToken = loginRes.body.accessToken as string;

      // Blocked pre-MFA on a genuinely privileged, ADMIN-only route.
      const blockedRes = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Should Be Blocked',
          firstAdmin: {
            email: uniqueTestEmail(),
            displayName: 'x',
            locale: 'en-US',
            timezone: 'UTC',
          },
        });
      expect(blockedRes.status).toBe(403);

      await completeMfaEnrollment({ email, userId: created.id, accessToken, refreshToken: '' });

      // Works post-MFA, using only this bootstrap-created admin — no other admin involved.
      const orgName = `Bootstrap Org ${randomUUID()}`;
      const workingRes = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: orgName,
          firstAdmin: {
            email: uniqueTestEmail(),
            displayName: 'First Admin',
            locale: 'en-US',
            timezone: 'UTC',
          },
        });
      expect(workingRes.status).toBe(201);
      createdOrgIds.push(workingRes.body.id as string);
    });
  });
});
