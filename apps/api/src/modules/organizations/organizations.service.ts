import { randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma as PrismaNamespace, PrismaClient } from '@linguaai/database';
import { Prisma } from '@linguaai/database';
import { getCorrelationId } from '@linguaai/observability';
import type {
  AddOrganizationMembersRequest,
  AddOrganizationMembersResponse,
  CreateOrganizationRequest,
  OrganizationDetailResponse,
  OrganizationMember,
  OrganizationMemberInput,
} from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';

type Tx = PrismaNamespace.TransactionClient;

/**
 * `OrganizationsModule` (Part 6/Part 7, E2-T15). Every write here
 * (`createOrganization`/`addMembers`/`removeMember`) touches `User.organizationId`
 * — a Part 9C privileged column, excluded from `app_role`'s `UPDATE` grant
 * (E2-T6) — so every write runs through `app_service_role`, per Part 9's
 * own explicit provisioning text ("Bulk CSV import creates User +
 * OrganizationMembership in the same transaction... via app_service_role").
 * This is a deliberate, flagged extension of the "Service-role exception"
 * list (previously: registration, OAuth-creation, bootstrap, GDPR erasure)
 * — CODE_REVIEW_CHECKLIST.md calls out any new `app_service_role` use as
 * needing extra review.
 *
 * `getOrganization` (a pure read, no privileged-column write) is the one
 * exception: it goes through `APP_PRISMA_CLIENT`, genuinely exercising
 * E2-T14's RLS mechanism (`org_read`/`membership_read`) — the first real
 * production consumer of that pipeline.
 *
 * Authorization for every method beyond `POST /v1/organizations` (which
 * `RolesGuard`'s `@Roles('ADMIN')` already gates) is "that org's
 * `ENTERPRISE_ADMIN`, or a platform `ADMIN`" (Part 6) — a check
 * `RolesGuard` can't express (it only reads `User.role`, not the caller's
 * own `OrganizationMembership.orgRole`), so it lives here, per-method, per
 * Part 9's "ownership checks are per-service-method, not centralized"
 * design.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * `POST /v1/organizations` (Part 6, platform-`ADMIN`-only —
   * `RolesGuard`/`@Roles('ADMIN')` at the controller). Creates the
   * `Organization` and designates `dto.firstAdmin` as its first
   * `ENTERPRISE_ADMIN`, atomically, via the same find-or-create-member
   * primitive `addMembers` uses.
   */
  async createOrganization(
    caller: RequestUser,
    dto: CreateOrganizationRequest,
  ): Promise<OrganizationDetailResponse> {
    const correlationId = getCorrelationId() ?? randomUUID();

    const result = await this.servicePrisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.name, dataRegion: dto.dataRegion ?? null },
      });
      const member = await this.upsertMember(tx, org.id, dto.firstAdmin, 'ENTERPRISE_ADMIN');

      await tx.auditLog.create({
        data: {
          actorUserId: caller.userId,
          actorType: 'USER',
          action: 'organization.created',
          targetType: 'Organization',
          targetId: org.id,
          tenantId: org.id,
          correlationId,
          beforeValue: Prisma.JsonNull,
          afterValue: { name: org.name, dataRegion: org.dataRegion },
        },
      });

      return {
        id: org.id,
        name: org.name,
        dataRegion: org.dataRegion,
        seatCount: org.seatCount,
        createdAt: org.createdAt.toISOString(),
        members: [member],
      };
    });

    // Published only after commit — same reasoning as `addMembers`.
    const firstAdmin = result.members[0];
    if (firstAdmin) {
      await this.events.publish('identity.organization.membership_changed', {
        userId: firstAdmin.userId,
        tenantId: result.id,
        payload: { organizationId: result.id, userId: firstAdmin.userId, action: 'added' },
      });
    }

    return result;
  }

  /**
   * `GET /v1/organizations/:id` (Part 6). Tenant-scoped 404 (not 403) if
   * the caller isn't that org's `ENTERPRISE_ADMIN` or a platform `ADMIN`
   * (API_GUIDELINES.md §3's no-existence-leak rule, same as Part 9's own
   * RLS negative examples) — checked at the application layer first
   * (Part 6's stricter "ENTERPRISE_ADMIN of that org," not RLS's own looser
   * "any member"), then the read itself runs through `APP_PRISMA_CLIENT`,
   * genuinely subject to `org_read`/`membership_read` RLS.
   */
  async getOrganization(caller: RequestUser, orgId: string): Promise<OrganizationDetailResponse> {
    this.assertCallerManagesOrg(caller, orgId);

    const org = await this.appPrisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    const memberships = await this.appPrisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });

    // Part 9B's required-events list: "every platform-ADMIN cross-tenant
    // read/write... audited specifically because it's the one path that
    // legitimately crosses the tenant boundary through the standard role."
    // Scoped here to platform admins reading an org (every org is
    // necessarily "cross-tenant" for them, since they belong to none) —
    // not every read in the system, which Part 9B's own list doesn't
    // otherwise enumerate and would be a much larger, unscoped audit-volume
    // decision than this task's own text supports. Flagged interpretation.
    if (caller.role === 'ADMIN') {
      await this.appPrisma.auditLog.create({
        data: {
          actorUserId: caller.userId,
          actorType: 'USER',
          action: 'organization.cross_tenant_read',
          targetType: 'Organization',
          targetId: org.id,
          tenantId: org.id,
          correlationId: getCorrelationId() ?? randomUUID(),
        },
      });
    }

    return {
      id: org.id,
      name: org.name,
      dataRegion: org.dataRegion,
      seatCount: org.seatCount,
      createdAt: org.createdAt.toISOString(),
      members: memberships.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        displayName: m.user.displayName,
        orgRole: m.orgRole,
      })),
    };
  }

  /**
   * `POST /v1/organizations/:id/members` (Part 6) — "Also accepts CSV bulk
   * import": this endpoint's own wire contract is always this JSON array
   * (CSV parsing, if any, is a client-side concern — no other endpoint in
   * Part 6's surface is `multipart/form-data`). The whole batch is one
   * transaction (Part 9: "creates User + OrganizationMembership in the
   * same transaction... atomically") — one member failing (e.g. already
   * belongs to a different org) rolls back the entire batch, not a partial
   * import.
   */
  async addMembers(
    caller: RequestUser,
    orgId: string,
    dto: AddOrganizationMembersRequest,
  ): Promise<AddOrganizationMembersResponse> {
    this.assertCallerManagesOrg(caller, orgId);
    const correlationId = getCorrelationId() ?? randomUUID();

    const result = await this.servicePrisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      const members: OrganizationMember[] = [];
      for (const input of dto.members) {
        const member = await this.upsertMember(tx, orgId, input, dto.orgRole);
        members.push(member);
        await tx.auditLog.create({
          data: {
            actorUserId: caller.userId,
            actorType: 'USER',
            action: 'organization.member.added',
            targetType: 'OrganizationMembership',
            targetId: member.userId,
            tenantId: orgId,
            correlationId,
            beforeValue: Prisma.JsonNull,
            afterValue: { email: member.email, orgRole: member.orgRole },
          },
        });
      }

      return { members };
    });

    // Published only after the transaction has actually committed —
    // publishing from inside the `tx` callback would risk events for a
    // batch that later rolls back (Part 9: bulk import is all-or-nothing;
    // BullMQ's own publish isn't part of the Postgres transaction, so an
    // in-transaction publish can't be undone if the DB writes are).
    for (const member of result.members) {
      await this.events.publish('identity.organization.membership_changed', {
        userId: member.userId,
        tenantId: orgId,
        payload: { organizationId: orgId, userId: member.userId, action: 'added' },
      });
    }

    return result;
  }

  /**
   * `DELETE /v1/organizations/:id/members/:userId` (Part 6). "Blocked if
   * target is the org's last `ENTERPRISE_ADMIN`" is enforced twice
   * (Part 9's defense-in-depth): the DB trigger (E2-T15 migration) is
   * authoritative and always fires; translating its raised
   * `cannot_remove_last_enterprise_admin` into a `409 Conflict` here is
   * this method's own job, not a duplicate application-layer count check
   * that the same class of bug (Part 9C's own reasoning) could route
   * around.
   *
   * **`User.tokensValidAfter` bump (E2 acceptance-review remediation,
   * finding F1).** Part 5/Part 9A require this on "every role/org-membership
   * change" — `set_org_role()`'s demotion path and GDPR erasure both already
   * did it; plain removal did not, which was the actual defect (not a
   * design decision — the adjacent paths prove it). Bumped in the same
   * `tx.user.update` as `organizationId: null`, so there is no window where
   * the membership is gone but the claim is still fresh. This reuses the
   * existing staleness model exactly (`JwtStrategy.validate`'s
   * `iat >= tokensValidAfter` check, ADR-018) rather than introducing a new
   * mechanism: the removed member's outstanding access token — for every
   * session, not just one — is rejected on its very next use, forcing a
   * refresh that mints a token with the correct (no-org) claims. This is
   * deliberately **not** full session/refresh-token revocation (unlike
   * logout or GDPR erasure's hard delete) — removal ends org membership,
   * it doesn't end the user's account session, exactly mirroring how a
   * demotion doesn't log the demoted user out either.
   */
  async removeMember(caller: RequestUser, orgId: string, userId: string): Promise<void> {
    this.assertCallerManagesOrg(caller, orgId);
    const correlationId = getCorrelationId() ?? randomUUID();

    try {
      await this.servicePrisma.$transaction(async (tx) => {
        const org = await tx.organization.findUnique({ where: { id: orgId } });
        if (!org) {
          throw new NotFoundException('Organization not found');
        }
        const membership = await tx.organizationMembership.findUnique({
          where: { userId_organizationId: { userId, organizationId: orgId } },
        });
        if (!membership) {
          throw new NotFoundException('Member not found');
        }

        // `deleteMany` (not `delete`) — idempotent under a concurrent
        // duplicate removal of the same membership: if another request
        // already deleted this row between the `findUnique` above and here,
        // `delete` throws Prisma P2025 (record not found), which is not a
        // clean, mappable outcome; `deleteMany`'s `count` tells us
        // definitively whether *this* call actually removed the row.
        const deleted = await tx.organizationMembership.deleteMany({
          where: { id: membership.id },
        });
        if (deleted.count === 0) {
          throw new NotFoundException('Member not found');
        }
        await tx.user.update({
          where: { id: userId },
          data: { organizationId: null, tokensValidAfter: new Date() },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: caller.userId,
            actorType: 'USER',
            action: 'organization.member.removed',
            targetType: 'OrganizationMembership',
            targetId: membership.id,
            tenantId: orgId,
            correlationId,
            beforeValue: { userId, orgRole: membership.orgRole },
            afterValue: Prisma.JsonNull,
          },
        });
      });

      // Published only after commit — same reasoning as `addMembers`.
      await this.events.publish('identity.organization.membership_changed', {
        userId,
        tenantId: orgId,
        payload: { organizationId: orgId, userId, action: 'removed' },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      // Postgres wraps the trigger's RAISE EXCEPTION as `P0001`, but Prisma
      // surfaces it as either `PrismaClientUnknownRequestError` or
      // `PrismaClientKnownRequestError` (code `P2010`) depending on the
      // call site — confirmed empirically (E2-T16) that both occur for
      // outwardly-identical raw-query failures, so matching on `.message`
      // content directly (not a specific Prisma error subclass) is what's
      // actually reliable here.
      if (error instanceof Error && error.message.includes('cannot_remove_last_enterprise_admin')) {
        throw new ConflictException("Cannot remove the organization's last ENTERPRISE_ADMIN");
      }
      throw error;
    }
  }

  /**
   * "That org's `ENTERPRISE_ADMIN`, or a platform `ADMIN`" (Part 6) — reads
   * the caller's own `orgRole`/`organizationId` JWT claims (already
   * staleness-checked by `JwtStrategy`), never a fresh DB read: this is an
   * authorization gate, not a data query. 404, not 403 — API_GUIDELINES.md
   * §3's no-existence-leak rule, applied uniformly whether the org doesn't
   * exist or the caller just isn't authorized for it.
   */
  private assertCallerManagesOrg(caller: RequestUser, orgId: string): void {
    const isPlatformAdmin = caller.role === 'ADMIN';
    const isThatOrgsAdmin =
      caller.organizationId === orgId && caller.orgRole === 'ENTERPRISE_ADMIN';
    if (!isPlatformAdmin && !isThatOrgsAdmin) {
      throw new NotFoundException('Organization not found');
    }
  }

  /**
   * Find-or-create-and-attach a member (Part 9's provisioning mechanism,
   * shared by `createOrganization`'s first-admin designation and
   * `addMembers`'s single/bulk add). An existing user who already belongs
   * to *any* organization (this one or another) is a conflict — a user
   * belongs to at most one org (`User.organizationId` is a single nullable
   * FK) and cross-org reassignment isn't in this Epic's scope. A
   * newly-created user gets `passwordHash: null` — **flagged, not solved
   * here**: there is no invite/set-password endpoint anywhere in Part 6's
   * API surface, so a bulk-imported user has no way to complete a first
   * login yet (no password to verify against, and no OAuth identity
   * necessarily linked either) — the same category of gap already flagged
   * for OAuth-only accounts, but with no equivalent alternate login path.
   */
  private async upsertMember(
    tx: Tx,
    orgId: string,
    input: OrganizationMemberInput,
    orgRole: 'MEMBER' | 'ENTERPRISE_ADMIN',
  ): Promise<OrganizationMember> {
    const existing = await tx.user.findUnique({ where: { email: input.email } });

    const user = existing
      ? await (async () => {
          if (existing.organizationId !== null) {
            throw new ConflictException(`${input.email} already belongs to an organization`);
          }
          return tx.user.update({ where: { id: existing.id }, data: { organizationId: orgId } });
        })()
      : await tx.user.create({
          data: {
            email: input.email,
            passwordHash: null,
            displayName: input.displayName,
            locale: input.locale,
            timezone: input.timezone,
            status: 'ACTIVE',
            organizationId: orgId,
          },
        });

    await tx.organizationMembership.create({
      data: { userId: user.id, organizationId: orgId, orgRole },
    });

    return { userId: user.id, email: user.email, displayName: user.displayName, orgRole };
  }
}
