import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { APP_PRISMA_CLIENT, type AppPrismaClient } from '../src/database/index.js';
import { TEST_PASSWORD, registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * A throwaway, test-only controller — not part of `apps/api/src`, never
 * shipped — that exercises `APP_PRISMA_CLIENT` (the real, extended client)
 * behind the real `AuthGuard('jwt')` and the real globally-registered
 * `TenantContextInterceptor`. This is deliberate, not incidental: an
 * earlier version of this suite called `runWithTenantContext` directly
 * from the test body, bypassing the interceptor/RxJS pipeline entirely —
 * that shape reproducibly failed to propagate `AsyncLocalStorage` context
 * through Prisma's real query engine specifically when the client was
 * obtained via `Test.createTestingModule` (confirmed via a throwaway spike:
 * identical direct construction with no NestJS DI involved worked fine;
 * `Test.createTestingModule` plus a direct `await runWithTenantContext(...)`
 * call in the test body did not, regardless of which modules were
 * imported — a Jest/AsyncLocalStorage/Prisma interaction, not a flaw in
 * `tenant-rls.extension.ts` itself). The real HTTP request path (guard →
 * `TenantContextInterceptor`'s `Observable`-based propagation → controller
 * → service) was already proven correct by every other e2e suite in this
 * codebase (auth/users/mfa/oauth), including `mfa.e2e-spec.ts`'s
 * `complete_mfa_enrollment()` calls, which only succeed if
 * `app.current_user_id` was set correctly by this exact mechanism. This
 * suite drives the same, real, already-proven-working path instead of
 * re-implementing a different (and, it turns out, Jest-fragile) one.
 */
@Controller('test-only/rls-probe')
@UseGuards(AuthGuard('jwt'))
class RlsProbeController {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: AppPrismaClient) {}

  @Get('user/:id')
  user(@Param('id') id: string) {
    return this.appPrisma.user.findUnique({ where: { id } });
  }

  @Get('org/:id')
  org(@Param('id') id: string) {
    return this.appPrisma.organization.findUnique({ where: { id } });
  }

  @Get('org-members/:orgId')
  members(@Param('orgId') orgId: string) {
    return this.appPrisma.organizationMembership.findMany({ where: { organizationId: orgId } });
  }

  // --- Write-policy probes (org_insert/org_update/org_delete,
  // membership_insert/membership_update/membership_delete,
  // user_insert/user_update/user_delete) — Part 9's policy matrix defines
  // four policies per table, not just READ; a "RETURNING"-visible UPDATE/
  // DELETE that RLS hides throws Prisma's P2025 (record not found), and an
  // INSERT whose WITH CHECK fails throws a real Postgres RLS-violation
  // error — both distinguishable from success without needing a bespoke
  // HTTP-status mapping for what is deliberately a throwaway test route.

  @Post('org-insert')
  insertOrg() {
    return this.appPrisma.organization.create({ data: { name: `RLS Probe Org ${randomUUID()}` } });
  }

  @Post('org/:id/update')
  updateOrg(@Param('id') id: string) {
    return this.appPrisma.organization.update({
      where: { id },
      data: { name: `RLS Probe Update ${randomUUID()}` },
    });
  }

  @Post('org/:id/delete')
  deleteOrg(@Param('id') id: string) {
    return this.appPrisma.organization.delete({ where: { id } });
  }

  @Post('org-members-insert')
  insertMembership(
    @Body()
    body: {
      userId: string;
      organizationId: string;
      orgRole: 'MEMBER' | 'ENTERPRISE_ADMIN';
    },
  ) {
    return this.appPrisma.organizationMembership.create({ data: body });
  }

  @Post('org-members/:id/update')
  updateMembership(@Param('id') id: string) {
    return this.appPrisma.organizationMembership.update({
      where: { id },
      data: { orgRole: 'MEMBER' },
    });
  }

  @Post('org-members/:id/delete')
  deleteMembership(@Param('id') id: string) {
    return this.appPrisma.organizationMembership.delete({ where: { id } });
  }

  @Post('user-insert')
  insertUser() {
    return this.appPrisma.user.create({
      data: {
        email: `rls-probe-${randomUUID()}@test.local`,
        displayName: 'RLS Probe',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });
  }

  @Post('user/:id/update')
  updateUser(@Param('id') id: string) {
    // displayName is on app_role's column-privilege allowlist (E2-T6,
    // Part 9C) — this probe isolates the RLS `user_update` USING clause
    // specifically, not the separate column-grant layer.
    return this.appPrisma.user.update({
      where: { id },
      data: { displayName: `RLS Probe Update ${randomUUID()}` },
    });
  }

  @Post('user/:id/delete')
  deleteUser(@Param('id') id: string) {
    return this.appPrisma.user.delete({ where: { id } });
  }
}

/**
 * Part 16's mandatory cross-tenant-leak test class — the first real
 * exercise of E2-T14's mechanism (`tenant-rls.extension.ts` +
 * `TenantContextInterceptor`) against the real RLS policies E2-T4 deployed
 * for `User`/`Organization`/`OrganizationMembership`. No controller route
 * exercises this in production yet (`OrganizationsModule` is E2-T15's
 * scope) — `RlsProbeController` above stands in for it, using the same
 * real guard/interceptor/client every future real route will use.
 */
describe('Tenant RLS (e2e) — cross-tenant leak test class (Part 16)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  // Seeded with [orgA.id, orgB.id] once created in beforeAll; the
  // write-policy probe tests below push any org they successfully create
  // (org_insert's allowed case) onto this same array too.
  const createdOrgIds: string[] = [];

  let orgA: { id: string };
  let orgB: { id: string };
  let sessionA: RegisteredSession;
  let sessionA2: RegisteredSession;
  let sessionB: RegisteredSession;
  let sessionNoOrg: RegisteredSession;
  let sessionPlatformAdmin: RegisteredSession;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RlsProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();

    orgA = await setupPrisma.organization.create({ data: { name: 'Tenant RLS Test Org A' } });
    orgB = await setupPrisma.organization.create({ data: { name: 'Tenant RLS Test Org B' } });
    createdOrgIds.push(orgA.id, orgB.id);

    sessionNoOrg = await registerAndLogin(app);
    sessionA = await registerAndLogin(app);
    sessionA2 = await registerAndLogin(app);
    sessionB = await registerAndLogin(app);
    sessionPlatformAdmin = await registerAndLogin(app);
    createdUserIds.push(
      sessionNoOrg.userId,
      sessionA.userId,
      sessionA2.userId,
      sessionB.userId,
      sessionPlatformAdmin.userId,
    );

    await setupPrisma.user.update({
      where: { id: sessionA.userId },
      data: { organizationId: orgA.id },
    });
    await setupPrisma.user.update({
      where: { id: sessionA2.userId },
      data: { organizationId: orgA.id },
    });
    await setupPrisma.user.update({
      where: { id: sessionB.userId },
      data: { organizationId: orgB.id },
    });
    await setupPrisma.organizationMembership.create({
      data: { userId: sessionA.userId, organizationId: orgA.id, orgRole: 'MEMBER' },
    });
    await setupPrisma.organizationMembership.create({
      data: { userId: sessionA2.userId, organizationId: orgA.id, orgRole: 'ENTERPRISE_ADMIN' },
    });
    await setupPrisma.organizationMembership.create({
      data: { userId: sessionB.userId, organizationId: orgB.id, orgRole: 'MEMBER' },
    });
    await setupPrisma.user.update({
      where: { id: sessionPlatformAdmin.userId },
      data: { role: 'ADMIN' },
    });

    // The JWT's role/organizationId/orgRole claims are snapshotted at login
    // time (Part 8) — every row mutation above happened after the initial
    // registerAndLogin, so each session needs a fresh login to pick it up.
    sessionA = await reLogin(sessionA);
    sessionA2 = await reLogin(sessionA2);
    sessionB = await reLogin(sessionB);
    sessionPlatformAdmin = await reLogin(sessionPlatformAdmin);
  });

  async function reLogin(session: RegisteredSession): Promise<RegisteredSession> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: session.email, password: TEST_PASSWORD });
    return { ...session, accessToken: res.body.accessToken as string };
  }

  afterAll(async () => {
    // userA2 is orgA's only ENTERPRISE_ADMIN — E2-T15's defense-in-depth
    // trigger correctly blocks removing them otherwise; `setupPrisma`
    // connects as the migration superuser, so it can disable triggers for
    // this teardown-only session.
    await setupPrisma.$executeRawUnsafe('SET session_replication_role = replica');
    await setupPrisma.organizationMembership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await setupPrisma.$disconnect();
    await app.close();
  });

  function probe(path: string, accessToken: string) {
    return request(app.getHttpServer())
      .get(`/v1/test-only/rls-probe/${path}`)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function probePost(path: string, accessToken: string, body?: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/v1/test-only/rls-probe/${path}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
  }

  describe('User (Part 9: "the table the first review found missing entirely")', () => {
    it('a caller can always read their own row via id = current_user_id, even with no organization', async () => {
      const res = await probe(`user/${sessionNoOrg.userId}`, sessionNoOrg.accessToken);
      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(sessionNoOrg.userId);
    });

    it('a caller can read a same-organization user who is not themselves, via organizationId = current_org_id', async () => {
      const res = await probe(`user/${sessionA2.userId}`, sessionA.accessToken);
      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(sessionA2.userId);
    });

    it("negative example (Part 9, verbatim): a caller cannot read a different organization's user, even with the application-layer filter absent here by construction", async () => {
      const res = await probe(`user/${sessionB.userId}`, sessionA.accessToken);
      expect(res.status).toBe(200);
      // A `null` controller return serializes as an empty HTTP body, which
      // supertest/superagent parses as `{}`, not JS `null` — asserting on
      // the absence of an `id` is the robust check either way.
      expect(res.body?.id).toBeUndefined();
    });

    it('a platform admin (is_platform_admin = true) can read across the tenant boundary', async () => {
      const res = await probe(`user/${sessionB.userId}`, sessionPlatformAdmin.accessToken);
      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(sessionB.userId);
    });
  });

  describe('Organization (org_read policy)', () => {
    it('negative example (Part 9, verbatim): an ENTERPRISE_ADMIN of Org A cannot read Org B', async () => {
      const res = await probe(`org/${orgB.id}`, sessionA2.accessToken);
      expect(res.status).toBe(200);
      expect(res.body?.id).toBeUndefined();
    });

    it('a member can read their own organization', async () => {
      const res = await probe(`org/${orgA.id}`, sessionA.accessToken);
      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(orgA.id);
    });

    it('a platform admin can read any organization', async () => {
      const res = await probe(`org/${orgB.id}`, sessionPlatformAdmin.accessToken);
      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(orgB.id);
    });
  });

  describe('OrganizationMembership (membership_read policy)', () => {
    it("a member of Org A cannot see Org B's membership rows", async () => {
      const res = await probe(`org-members/${orgB.id}`, sessionA.accessToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("a member of Org A sees Org A's membership rows, including other members", async () => {
      const res = await probe(`org-members/${orgA.id}`, sessionA.accessToken);
      expect(res.status).toBe(200);
      const userIds = (res.body as { userId: string }[]).map((r) => r.userId).sort();
      expect(userIds).toEqual([sessionA.userId, sessionA2.userId].sort());
    });
  });

  // Part 9's policy matrix defines four policies per table (read/insert/
  // update/delete), not just read — the blocks above prove `*_read`; these
  // prove the write side, declared last so they run after (and never
  // mutate state depended on by) the read-only blocks above. Assertions use
  // `>= 400` / `< 400` rather than an exact status code: RLS enforcement —
  // not the incidental HTTP shape of this throwaway probe route — is what
  // each test proves. A denied write surfaces as an unhandled Prisma error
  // (P2025 "record not found" for an UPDATE/DELETE RLS hides, or a real
  // Postgres "new row violates row-level security policy" for a denied
  // INSERT) which `GlobalExceptionFilter` maps to a generic 5xx.

  describe('Organization write policies (org_insert/org_update/org_delete)', () => {
    it('org_insert: a non-admin caller cannot create an Organization row', async () => {
      const res = await probePost('org-insert', sessionA.accessToken);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('org_insert: a platform admin can create an Organization row', async () => {
      const res = await probePost('org-insert', sessionPlatformAdmin.accessToken);
      expect(res.status).toBeLessThan(400);
      expect(res.body?.id).toBeTruthy();
      createdOrgIds.push(res.body.id as string);
    });

    it('org_update: negative example — an ENTERPRISE_ADMIN of Org A cannot update Org B', async () => {
      const res = await probePost(`org/${orgB.id}/update`, sessionA2.accessToken);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("org_update: that org's ENTERPRISE_ADMIN can update their own organization", async () => {
      const res = await probePost(`org/${orgA.id}/update`, sessionA2.accessToken);
      expect(res.status).toBeLessThan(400);
      expect(res.body?.id).toBe(orgA.id);
    });

    it('org_delete: a non-admin caller cannot delete an Organization row', async () => {
      const throwaway = await setupPrisma.organization.create({
        data: { name: `RLS Delete Probe ${randomUUID()}` },
      });
      createdOrgIds.push(throwaway.id);

      const res = await probePost(`org/${throwaway.id}/delete`, sessionA.accessToken);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(
        await setupPrisma.organization.findUnique({ where: { id: throwaway.id } }),
      ).not.toBeNull();
    });

    it('org_delete: a platform admin can delete an Organization row', async () => {
      const throwaway = await setupPrisma.organization.create({
        data: { name: `RLS Delete Probe ${randomUUID()}` },
      });

      const res = await probePost(`org/${throwaway.id}/delete`, sessionPlatformAdmin.accessToken);

      expect(res.status).toBeLessThan(400);
      expect(await setupPrisma.organization.findUnique({ where: { id: throwaway.id } })).toBeNull();
    });
  });

  describe('OrganizationMembership write policies (membership_insert/membership_update/membership_delete)', () => {
    it("membership_insert: negative example (Part 9, verbatim) — Org A's ENTERPRISE_ADMIN cannot insert a membership row for Org B", async () => {
      const outsider = await registerAndLogin(app);
      createdUserIds.push(outsider.userId);

      const res = await probePost('org-members-insert', sessionA2.accessToken, {
        userId: outsider.userId,
        organizationId: orgB.id,
        orgRole: 'MEMBER',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("membership_insert: Org A's ENTERPRISE_ADMIN can insert a membership row for Org A", async () => {
      const newMember = await registerAndLogin(app);
      createdUserIds.push(newMember.userId);

      const res = await probePost('org-members-insert', sessionA2.accessToken, {
        userId: newMember.userId,
        organizationId: orgA.id,
        orgRole: 'MEMBER',
      });

      expect(res.status).toBeLessThan(400);
      expect(res.body?.userId).toBe(newMember.userId);
    });

    it('membership_update: denied even within the caller\'s own org — `OrganizationMembership` UPDATE is revoked from app_role entirely (Part 9C: "orgRole changes go through set_org_role() only"), so this table\'s own `membership_update` RLS policy is defense-in-depth never actually reached through the standard write path; role-lifecycle.e2e-spec.ts (E2-T24) is what proves the real governance-function path works', async () => {
      const membershipA = await setupPrisma.organizationMembership.findUniqueOrThrow({
        where: { userId_organizationId: { userId: sessionA.userId, organizationId: orgA.id } },
      });

      // Even the row's own org's ENTERPRISE_ADMIN — who membership_update's
      // RLS policy alone WOULD allow — is still denied, confirming the
      // REVOKE (not RLS) is what's actually gating this path.
      const res = await probePost(`org-members/${membershipA.id}/update`, sessionA2.accessToken);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('membership_update: also denied cross-org (both layers agree)', async () => {
      const membershipB = await setupPrisma.organizationMembership.findUniqueOrThrow({
        where: { userId_organizationId: { userId: sessionB.userId, organizationId: orgB.id } },
      });

      const res = await probePost(`org-members/${membershipB.id}/update`, sessionA2.accessToken);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('membership_delete: negative — a caller cannot delete a membership row belonging to a different org', async () => {
      const throwawayUser = await registerAndLogin(app);
      createdUserIds.push(throwawayUser.userId);
      const membership = await setupPrisma.organizationMembership.create({
        data: { userId: throwawayUser.userId, organizationId: orgB.id, orgRole: 'MEMBER' },
      });

      const res = await probePost(`org-members/${membership.id}/delete`, sessionA2.accessToken);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(
        await setupPrisma.organizationMembership.findUnique({ where: { id: membership.id } }),
      ).not.toBeNull();
    });

    it("membership_delete: an org's ENTERPRISE_ADMIN can delete a membership row within their own org", async () => {
      const throwawayUser = await registerAndLogin(app);
      createdUserIds.push(throwawayUser.userId);
      const membership = await setupPrisma.organizationMembership.create({
        data: { userId: throwawayUser.userId, organizationId: orgA.id, orgRole: 'MEMBER' },
      });

      const res = await probePost(`org-members/${membership.id}/delete`, sessionA2.accessToken);

      expect(res.status).toBeLessThan(400);
      expect(
        await setupPrisma.organizationMembership.findUnique({ where: { id: membership.id } }),
      ).toBeNull();
    });
  });

  describe('User write policies (user_insert/user_update/user_delete)', () => {
    it('user_insert: WITH CHECK(false) — no caller, not even a platform admin, can insert a User row via the standard role', async () => {
      const res = await probePost('user-insert', sessionPlatformAdmin.accessToken);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('user_update: a caller can update their own row', async () => {
      const res = await probePost(`user/${sessionA.userId}/update`, sessionA.accessToken);
      expect(res.status).toBeLessThan(400);
    });

    it('user_update: an org ENTERPRISE_ADMIN can update a same-org user', async () => {
      const res = await probePost(`user/${sessionA.userId}/update`, sessionA2.accessToken);
      expect(res.status).toBeLessThan(400);
    });

    it("user_update: negative — a caller cannot update a different-organization user, even as that org's own ENTERPRISE_ADMIN", async () => {
      const res = await probePost(`user/${sessionB.userId}/update`, sessionA2.accessToken);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('user_delete: WITH CHECK(false) — no caller, not even a platform admin, can delete a User row via the standard role', async () => {
      const res = await probePost(
        `user/${sessionNoOrg.userId}/delete`,
        sessionPlatformAdmin.accessToken,
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(
        await setupPrisma.user.findUnique({ where: { id: sessionNoOrg.userId } }),
      ).not.toBeNull();
    });
  });
});
