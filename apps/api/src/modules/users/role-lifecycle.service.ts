import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrgRole, PrismaClient, Role } from '@linguaai/database';
import { getCorrelationId } from '@linguaai/observability';
import type { RoleChangeRequestResponse } from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

function toRoleChangeRequestDto(row: {
  id: string;
  targetUserId: string;
  fromRole: Role;
  toRole: Role;
  requestedBy: string;
  approvedBy: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
}): RoleChangeRequestResponse {
  return {
    id: row.id,
    targetUserId: row.targetUserId,
    fromRole: row.fromRole,
    toRole: row.toRole,
    requestedBy: row.requestedBy,
    approvedBy: row.approvedBy,
    status: row.status as RoleChangeRequestResponse['status'],
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/**
 * `role-lifecycle.service.ts` (Part 7/9A, E2-T16) — `User.role` and
 * `OrganizationMembership.orgRole` changes, both ultimately backed by the
 * `SECURITY DEFINER` governance functions E2-T5 built
 * (`approve_role_change()`/`set_org_role()`). Shared by two controllers:
 * `RoleChangeRequestsController` (`/v1/users/:id/role-change-requests*`)
 * and `OrganizationsController`'s `PATCH .../members/:userId/role`.
 *
 * Every governance-function call here goes through `APP_PRISMA_CLIENT`,
 * never `SERVICE_ROLE_PRISMA_CLIENT` — deliberately, and verified
 * empirically (a throwaway spike script, deleted after use) before writing
 * this: the functions are `SECURITY DEFINER`, owned by `governance_role`
 * (`NOBYPASSRLS`, E2-T5), so their own internal `SELECT`s (the caller-identity
 * check, the "remaining admins" count, the actor's own row/membership
 * lookup) are themselves subject to RLS. Calling through `app_role` means
 * `tenant-rls.extension.ts` (E2-T14) sets the *real caller's* session
 * context first — since every caller here has already been proven to be
 * either a platform `ADMIN` (`is_platform_admin = true`, satisfying every
 * policy's admin-override branch unconditionally) or that org's own
 * `ENTERPRISE_ADMIN` (`current_org_id` matching), the functions' internal
 * queries see exactly the rows they need. `SERVICE_ROLE_PRISMA_CLIENT`
 * would instead run them with *no* session context at all — reproducing
 * the exact false-block bug E2-T15's defense-in-depth trigger had before
 * its own fix.
 */
@Injectable()
export class RoleLifecycleService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * `POST /v1/users/:id/role-change-requests` (Part 6). `fromRole` is
   * always derived from the target's actual current role at request time,
   * never accepted from the client (Part 9C). Auto-approves immediately
   * (single-party, `p_require_different_approver = false`) unless the
   * change touches the `ADMIN` tier in either direction, per Part 9A's
   * table — those stay `PENDING` until a second `ADMIN` approves.
   */
  async initiateRoleChange(
    caller: RequestUser,
    targetUserId: string,
    toRole: Role,
  ): Promise<RoleChangeRequestResponse> {
    const target = await this.appPrisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role === toRole) {
      throw new ConflictException(`User already has role ${toRole}`);
    }

    const correlationId = getCorrelationId() ?? randomUUID();
    const involvesAdmin = target.role === 'ADMIN' || toRole === 'ADMIN';

    const request = await this.appPrisma.roleChangeRequest.create({
      data: {
        targetUserId,
        fromRole: target.role,
        toRole,
        requestedBy: caller.userId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + SEVENTY_TWO_HOURS_MS),
      },
    });

    await this.events.publish('identity.role.change_requested', {
      userId: targetUserId,
      payload: {
        targetUserId,
        fromRole: target.role,
        toRole,
        requestedBy: caller.userId,
        requiresApproval: involvesAdmin,
      },
    });

    if (!involvesAdmin) {
      await this.callApproveRoleChange(request.id, caller.userId, correlationId, false);
      await this.publishApprovedAndChanged(targetUserId, target.role, toRole, caller.userId);
    }

    const finalRow = await this.appPrisma.roleChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    return toRoleChangeRequestDto(finalRow);
  }

  /**
   * `POST /v1/users/:id/role-change-requests/:requestId/approve` (Part 6).
   * `require_different_approver = true` unconditionally — this endpoint is
   * *only* reachable for requests that stayed `PENDING`, i.e. `ADMIN`-tier
   * changes, which always require a second, different `ADMIN` (Part 9A).
   */
  async approveRoleChange(
    caller: RequestUser,
    targetUserId: string,
    requestId: string,
  ): Promise<RoleChangeRequestResponse> {
    const request = await this.appPrisma.roleChangeRequest.findUnique({ where: { id: requestId } });
    if (!request || request.targetUserId !== targetUserId) {
      throw new NotFoundException('Role change request not found');
    }

    const correlationId = getCorrelationId() ?? randomUUID();
    await this.callApproveRoleChange(requestId, caller.userId, correlationId, true);
    await this.publishApprovedAndChanged(
      targetUserId,
      request.fromRole,
      request.toRole,
      caller.userId,
    );

    const finalRow = await this.appPrisma.roleChangeRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    return toRoleChangeRequestDto(finalRow);
  }

  private async callApproveRoleChange(
    requestId: string,
    approverId: string,
    correlationId: string,
    requireDifferentApprover: boolean,
  ): Promise<void> {
    try {
      await this.appPrisma
        .$executeRaw`SELECT approve_role_change(${requestId}::uuid, ${approverId}::uuid, ${correlationId}::uuid, ${requireDifferentApprover})`;
    } catch (error) {
      throw this.translateGovernanceError(error);
    }
  }

  /** `identity.role.change_approved` + `identity.role.changed` (Part 10) — both fire together, only after `approve_role_change()` itself has already committed the transition (never speculatively before). */
  private async publishApprovedAndChanged(
    targetUserId: string,
    fromRole: Role,
    toRole: Role,
    approvedBy: string,
  ): Promise<void> {
    await this.events.publish('identity.role.change_approved', {
      userId: targetUserId,
      payload: { targetUserId, fromRole, toRole, approvedBy },
    });
    await this.events.publish('identity.role.changed', {
      userId: targetUserId,
      payload: { targetUserId, fromRole, toRole, changedBy: approvedBy },
    });
  }

  /**
   * `PATCH /v1/organizations/:id/members/:userId/role` (Part 6/9A) —
   * single-party, org-scoped. Authorization ("that org's `ENTERPRISE_ADMIN`,
   * or a platform `ADMIN`") mirrors `OrganizationsService`'s own
   * per-method check exactly — `RolesGuard` can't express an org-scoped
   * role, so it lives here too.
   */
  async changeOrgMemberRole(
    caller: RequestUser,
    orgId: string,
    targetUserId: string,
    orgRole: OrgRole,
  ): Promise<void> {
    this.assertCallerManagesOrg(caller, orgId);

    const membership = await this.appPrisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    const correlationId = getCorrelationId() ?? randomUUID();
    try {
      await this.appPrisma
        .$executeRaw`SELECT set_org_role(${membership.id}::uuid, ${orgRole}, ${caller.userId}::uuid, ${correlationId}::uuid)`;
    } catch (error) {
      throw this.translateGovernanceError(error);
    }

    await this.events.publish('identity.organization.membership_changed', {
      userId: targetUserId,
      tenantId: orgId,
      payload: { organizationId: orgId, userId: targetUserId, action: 'role_changed' },
    });
  }

  /** Same discriminant as `OrganizationsService.assertCallerManagesOrg` — kept local rather than shared to avoid a cross-module coupling for a four-line check (Part 9's "ownership checks are per-service-method, not centralized"). */
  private assertCallerManagesOrg(caller: RequestUser, orgId: string): void {
    const isPlatformAdmin = caller.role === 'ADMIN';
    const isThatOrgsAdmin =
      caller.organizationId === orgId && caller.orgRole === 'ENTERPRISE_ADMIN';
    if (!isPlatformAdmin && !isThatOrgsAdmin) {
      throw new NotFoundException('Organization not found');
    }
  }

  /**
   * Governance functions signal failure via `RAISE EXCEPTION` with a bare
   * message (Postgres `P0001`). Prisma surfaces this as either
   * `PrismaClientUnknownRequestError` or `PrismaClientKnownRequestError`
   * (code `P2010`) depending on the call site — confirmed empirically
   * (both occurred across this service's own different methods, for
   * outwardly-identical raw-query failures, and again in
   * `OrganizationsService`'s trigger-error translation, E2-T15) — so
   * matching on `.message` content of any `Error`, not a specific Prisma
   * error subclass, is what's actually reliable.
   */
  private translateGovernanceError(error: unknown): Error {
    if (error instanceof Error) {
      if (
        error.message.includes('cannot_demote_last_platform_admin') ||
        error.message.includes('cannot_demote_last_enterprise_admin')
      ) {
        return new ConflictException('This change would leave zero remaining admins');
      }
      if (error.message.includes('role_change_request_not_approvable')) {
        return new ConflictException(
          'This request is no longer approvable — it may already be resolved, expired, or you cannot approve your own request',
        );
      }
      if (error.message.includes('membership_not_found')) {
        return new NotFoundException('Member not found');
      }
      if (
        error.message.includes('actor_not_authorized_for_organization') ||
        error.message.includes('approver_not_authorized')
      ) {
        return new ForbiddenException('Not authorized for this action');
      }
      if (
        error.message.includes('actor_not_found_or_inactive') ||
        error.message.includes('approver_not_active') ||
        error.message.includes('approver_not_found')
      ) {
        return new ForbiddenException('Caller account is not active');
      }
      return error;
    }
    return new Error(String(error));
  }
}
