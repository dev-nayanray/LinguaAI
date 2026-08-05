import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient, PrismaClient } from '@linguaai/database';
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

// ts-jest transpiles this file to CommonJS (apps/api's jest config) —
// `__dirname` is CJS's own native global.
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * Integration tests against real Postgres — `audit.service.ts` (E2-T17).
 * Covers both required test classes: endpoint scoping (platform-wide vs.
 * org-scoped, per Part 6/9B) and audit immutability (Part 16, the fuller
 * version of which is E2-T25's own dedicated task) — plus a direct check
 * that several of Part 9B's required-events list actually produce exactly
 * one `AuditLog` row each, since no earlier task's own e2e suite ever
 * asserted on this directly (each just wrote the row and trusted it).
 */
describe('AuditModule (e2e)', () => {
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
    // EntitlementChangeLog.userId is onDelete: Restrict (not Cascade, unlike
    // most of this table's siblings) — must be cleared before user.deleteMany
    // below, or that call fails with a foreign-key violation.
    await setupPrisma.entitlementChangeLog.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.organizationMembership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    if (orgIds.length > 0) {
      await setupPrisma.auditLog.deleteMany({ where: { tenantId: { in: orgIds } } });
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
        name: `Audit Test Org ${seed.userId}`,
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

  describe('GET /v1/audit-log', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/audit-log');
      expect(res.status).toBe(401);
    });

    it('rejects a non-platform-ADMIN caller with 403', async () => {
      const { accessToken } = await freshSession();
      const res = await request(app.getHttpServer())
        .get('/v1/audit-log')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
    });

    it('happy path: a platform admin sees entries platform-wide, including from an organization they do not belong to', async () => {
      const { orgId } = await freshOrg();
      const admin = await freshPlatformAdmin();

      const res = await request(app.getHttpServer())
        .get('/v1/audit-log')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const orgCreationEntry = (
        res.body.data as { tenantId: string | null; action: string }[]
      ).find((e) => e.tenantId === orgId && e.action === 'organization.created');
      expect(orgCreationEntry).toBeDefined();
    });

    it('is filterable by action', async () => {
      const admin = await freshPlatformAdmin();
      await freshOrg();

      const res = await request(app.getHttpServer())
        .get('/v1/audit-log')
        .query({ action: 'organization.created', limit: 100 })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(
        (res.body.data as { action: string }[]).every((e) => e.action === 'organization.created'),
      ).toBe(true);
    });

    it('paginates via cursor — limit=1 returns exactly one row and a usable nextCursor', async () => {
      const admin = await freshPlatformAdmin();
      await freshOrg();
      await freshOrg();

      const firstPage = await request(app.getHttpServer())
        .get('/v1/audit-log')
        .query({ action: 'organization.created', limit: 1 })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(firstPage.body.data).toHaveLength(1);
      expect(firstPage.body.meta.nextCursor).toBeTruthy();

      const secondPage = await request(app.getHttpServer())
        .get('/v1/audit-log')
        .query({ action: 'organization.created', limit: 1, cursor: firstPage.body.meta.nextCursor })
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.data[0].id).not.toBe(firstPage.body.data[0].id);
    });
  });

  describe('GET /v1/organizations/:id/audit-log', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/organizations/11111111-1111-1111-1111-111111111111/audit-log',
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 for a caller who is not that org's ENTERPRISE_ADMIN", async () => {
      const { orgId } = await freshOrg();
      const outsider = await freshSession();
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/audit-log`)
        .set('Authorization', `Bearer ${outsider.accessToken}`);
      expect(res.status).toBe(404);
    });

    it("returns 404 for a *different* organization's ENTERPRISE_ADMIN (no cross-tenant leak)", async () => {
      const { orgId } = await freshOrg();
      const { enterpriseAdmin: outsiderAdmin } = await freshOrg();
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/audit-log`)
        .set('Authorization', `Bearer ${outsiderAdmin.accessToken}`);
      expect(res.status).toBe(404);
    });

    it("happy path: that org's ENTERPRISE_ADMIN sees only their own org's entries", async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const { orgId: otherOrgId } = await freshOrg();

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/audit-log`)
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`);

      expect(res.status).toBe(200);
      expect((res.body.data as { tenantId: string | null }[]).length).toBeGreaterThan(0);
      expect(
        (res.body.data as { tenantId: string | null }[]).every((e) => e.tenantId === orgId),
      ).toBe(true);
      expect(
        (res.body.data as { tenantId: string | null }[]).some((e) => e.tenantId === otherOrgId),
      ).toBe(false);
    });

    it("happy path: a platform admin can read any organization's audit log", async () => {
      const { orgId } = await freshOrg();
      const platformAdmin = await freshPlatformAdmin();

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/audit-log`)
        .set('Authorization', `Bearer ${platformAdmin.accessToken}`);

      expect(res.status).toBe(200);
    });
  });

  /**
   * E2-T25's dedicated audit-immutability test class (Part 16). Confirms
   * `UPDATE`/`DELETE` fail at the Postgres privilege level — E2-T7's grants
   * on `AuditLog`, extended here to `EntitlementChangeLog` (the same
   * migration revoked both, Part 9B lines 583-590, but only `AuditLog` had
   * a test) — for *both* roles that can reach these tables at all, not
   * merely because no application code path happens to expose it. Every
   * test connects directly as the role under test, bypassing the NestJS
   * app entirely — this is a database-privilege check, not a behavior the
   * API layer could meaningfully "get right" or "get wrong".
   *
   * `app_service_role` is included alongside `app_role` here — a real gap
   * found while building this task, not a pre-existing test: T7's own
   * migration only revoked `app_role`'s UPDATE/DELETE, but
   * `bootstrap-admin.ts` connects as `app_service_role` specifically to
   * INSERT its own AuditLog rows (no `app.current_user_id` exists yet for
   * the usual `app_role` path), so that role's retained UPDATE/DELETE
   * wasn't unused capability — it was a live, exploitable gap in exactly
   * the "compromised credential" threat model Part 9B's own text names.
   * Closed via a new migration (`20260731150000_revoke_audit_immutability_service_role`)
   * before writing the test that proves it, not the other way around.
   */
  describe('Audit immutability (Part 16, E2-T25)', () => {
    it.each([
      ['app_role', () => process.env.APP_DATABASE_URL],
      ['app_service_role', () => process.env.APP_SERVICE_ROLE_DATABASE_URL],
    ])(
      'UPDATE and DELETE on AuditLog both fail with a Postgres permission error for %s',
      async (_roleName, urlFn) => {
        const rolePrisma = new PrismaClient({ datasources: { db: { url: urlFn() } } });
        try {
          const existing = await setupPrisma.auditLog.findFirst();
          expect(existing).toBeTruthy();

          await expect(
            rolePrisma.$executeRaw`UPDATE "AuditLog" SET action = 'tampered' WHERE id = ${existing!.id}::uuid`,
          ).rejects.toThrow(/permission denied/i);
          await expect(
            rolePrisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${existing!.id}::uuid`,
          ).rejects.toThrow(/permission denied/i);
        } finally {
          await rolePrisma.$disconnect();
        }
      },
    );

    it.each([
      ['app_role', () => process.env.APP_DATABASE_URL],
      ['app_service_role', () => process.env.APP_SERVICE_ROLE_DATABASE_URL],
    ])(
      'UPDATE and DELETE on EntitlementChangeLog both fail with a Postgres permission error for %s',
      async (_roleName, urlFn) => {
        const rolePrisma = new PrismaClient({ datasources: { db: { url: urlFn() } } });
        try {
          // No application code writes EntitlementChangeLog rows yet (Part 5:
          // "entity defined now, write path owned by Epic E15") — a row is
          // created directly via the service-role client (the same
          // privileged path E15's future write path will use) purely as
          // this test's own fixture, not a claim that this is the intended
          // production writer.
          const target = await freshSession();
          // Superuser client (`setupPrisma`, already used for every other
          // fixture/teardown write in this file) — not a claim about which
          // role a real future E15 write path would use, only this test's
          // own setup.
          const seeded = await setupPrisma.entitlementChangeLog.create({
            data: {
              userId: target.userId,
              entitlementType: 'premium_subscription',
              action: 'GRANTED',
              source: 'test-fixture',
            },
          });

          await expect(
            rolePrisma.$executeRaw`UPDATE "EntitlementChangeLog" SET source = 'tampered' WHERE id = ${seeded.id}::uuid`,
          ).rejects.toThrow(/permission denied/i);
          await expect(
            rolePrisma.$executeRaw`DELETE FROM "EntitlementChangeLog" WHERE id = ${seeded.id}::uuid`,
          ).rejects.toThrow(/permission denied/i);
        } finally {
          await rolePrisma.$disconnect();
        }
      },
    );

    it('app_service_role can still INSERT into AuditLog and EntitlementChangeLog — the immutability grants narrow UPDATE/DELETE specifically, not the whole table', async () => {
      const target = await freshSession();
      const servicePrisma = new PrismaClient({
        datasources: { db: { url: process.env.APP_SERVICE_ROLE_DATABASE_URL } },
      });
      try {
        const auditRow = await servicePrisma.auditLog.create({
          data: {
            actorUserId: target.userId,
            actorType: 'SYSTEM',
            action: 'test.immutability_insert_probe',
            targetType: 'User',
            targetId: target.userId,
            correlationId: randomUUID(),
          },
        });
        expect(auditRow.id).toBeTruthy();

        const entitlementRow = await servicePrisma.entitlementChangeLog.create({
          data: {
            userId: target.userId,
            entitlementType: 'premium_subscription',
            action: 'GRANTED',
            source: 'test-fixture',
          },
        });
        expect(entitlementRow.id).toBeTruthy();
      } finally {
        await servicePrisma.$disconnect();
      }
    });
  });

  /**
   * T17's own acceptance criteria: "every action in Part 9B's required-events
   * list produces exactly one AuditLog row." Several of these were written
   * by earlier tasks (E2-T13/T15/T16) without any test ever asserting on
   * the resulting row directly — this closes that verification gap.
   */
  describe('Every required action produces exactly one AuditLog row (Part 9B)', () => {
    it('MFA enrollment (E2-T13)', async () => {
      const session = await freshSession();
      const enrollRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enroll')
        .set('Authorization', `Bearer ${session.accessToken}`);
      const secret = enrollRes.body.secret as string;
      await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ secret, code: authenticator.generate(secret) });

      const rows = await setupPrisma.auditLog.findMany({
        where: { targetId: session.userId, action: 'user.mfa.enrolled' },
      });
      expect(rows).toHaveLength(1);
    });

    it('organization membership change: add member (E2-T15)', async () => {
      const { orgId, enterpriseAdmin } = await freshOrg();
      const memberEmail = uniqueTestEmail();
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${enterpriseAdmin.accessToken}`)
        .send({
          members: [{ email: memberEmail, displayName: 'X', locale: 'en-US', timezone: 'UTC' }],
        });

      const rows = await setupPrisma.auditLog.findMany({
        where: { tenantId: orgId, action: 'organization.member.added' },
      });
      expect(rows).toHaveLength(1);
    });

    it('role promotion/demotion via approve_role_change() (E2-T16)', async () => {
      const requester = await freshPlatformAdmin();
      const approver = await freshPlatformAdmin();
      const target = await freshSession();
      const initiateRes = await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests`)
        .set('Authorization', `Bearer ${requester.accessToken}`)
        .send({ toRole: 'ADMIN' });
      await request(app.getHttpServer())
        .post(`/v1/users/${target.userId}/role-change-requests/${initiateRes.body.id}/approve`)
        .set('Authorization', `Bearer ${approver.accessToken}`);

      const rows = await setupPrisma.auditLog.findMany({
        where: { targetId: target.userId, action: 'user.role.changed' },
      });
      expect(rows).toHaveLength(1);
      await setupPrisma.user.update({ where: { id: target.userId }, data: { role: 'USER' } });
    });

    it('platform-admin cross-tenant read (E2-T17)', async () => {
      const { orgId } = await freshOrg();
      const admin = await freshPlatformAdmin();
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);

      const rows = await setupPrisma.auditLog.findMany({
        where: {
          targetId: orgId,
          actorUserId: admin.userId,
          action: 'organization.cross_tenant_read',
        },
      });
      expect(rows).toHaveLength(1);
    });

    // A genuinely "fresh, zero ADMINs anywhere" bootstrap run cannot be
    // reliably exercised from *this* describe block: many earlier tests in
    // this same file (and concurrently-running e2e suites, in the same
    // shared dev database) have already promoted users to ADMIN by the time
    // any test here runs, so bootstrap-admin.ts's own existingAdminCount
    // check (E2-T17) always observes existingAdminCount > 0 at this point.
    // role-lifecycle.e2e-spec.ts's "Bootstrap CLI, exercised end-to-end"
    // test already covers the CLI's core mechanics (creates a working,
    // MFA-gated ADMIN) without asserting which of the two action strings
    // gets written, for the same reason. What's new and specifically needs
    // coverage here is E2-T17's branching logic itself — proven below by
    // deliberately relying on (and asserting) the ambient existingAdmins > 0
    // condition that's already guaranteed true this deep into the suite.
    it('bootstrap admin creation, emergency recovery — a distinct action from an ordinary bootstrap (E2-T17 fix)', async () => {
      const existingAdmins = await setupPrisma.user.count({ where: { role: 'ADMIN' } });
      expect(existingAdmins).toBeGreaterThan(0);

      const email = uniqueTestEmail();
      const secret = process.env.BOOTSTRAP_ADMIN_SECRET;
      execSync(
        `pnpm --filter @linguaai/database run bootstrap-admin -- --email ${email} --display-name "Recovery Admin" --password "recovery horse battery staple" --secret "${secret}"`,
        { cwd: REPO_ROOT, stdio: 'pipe' },
      );
      const created = await setupPrisma.user.findUniqueOrThrow({ where: { email } });
      createdUserIds.push(created.id);

      const recoveryRows = await setupPrisma.auditLog.findMany({
        where: { targetId: created.id, action: 'user.emergency_admin_recovery' },
      });
      expect(recoveryRows).toHaveLength(1);
      const ordinaryRows = await setupPrisma.auditLog.findMany({
        where: { targetId: created.id, action: 'user.bootstrap_admin_created' },
      });
      expect(ordinaryRows).toHaveLength(0);
    });
  });
});
