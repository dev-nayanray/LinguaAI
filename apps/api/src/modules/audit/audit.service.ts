import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type { AuditLog } from '@linguaai/types/identity';
import type { AuditLogListResponse, AuditLogQuery } from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';

interface AuditLogFilter {
  tenantId?: string;
  action?: string;
  actorUserId?: string;
}

function toAuditLogDto(row: {
  id: string;
  actorUserId: string | null;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string;
  tenantId: string | null;
  correlationId: string;
  beforeValue: unknown;
  afterValue: unknown;
  occurredAt: Date;
}): AuditLog {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorType: row.actorType as AuditLog['actorType'],
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    tenantId: row.tenantId,
    correlationId: row.correlationId,
    beforeValue: (row.beforeValue as Record<string, unknown> | null) ?? null,
    afterValue: (row.afterValue as Record<string, unknown> | null) ?? null,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/**
 * `audit.service.ts` (Part 9B, E2-T17). Both read endpoints go through
 * `APP_PRISMA_CLIENT`, genuinely subject to `audit_read` RLS (this task's
 * own migration) — the platform-wide endpoint works because a platform
 * `ADMIN`'s `is_platform_admin = true` branch unconditionally satisfies
 * that policy; the org-scoped endpoint works because `tenantId` matches
 * the caller's own `current_org_id`. The application-layer check on the
 * org-scoped endpoint is still needed and still primary, for the same
 * reason as every other org-scoped endpoint in this codebase (E2-T15/T16):
 * RLS's own policy is looser (any org member could satisfy
 * `tenantId = current_org_id`), while Part 6 requires specifically that
 * org's `ENTERPRISE_ADMIN`.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  /** `GET /v1/audit-log` (Part 6) — platform `ADMIN` only (`RolesGuard`), unscoped. */
  async listPlatformAuditLog(query: AuditLogQuery): Promise<AuditLogListResponse> {
    return this.list(
      { action: query.action, actorUserId: query.actorUserId },
      query.cursor,
      query.limit,
    );
  }

  /** `GET /v1/organizations/:id/audit-log` (Part 6) — that org's `ENTERPRISE_ADMIN`, or a platform `ADMIN`. */
  async listOrganizationAuditLog(
    caller: RequestUser,
    orgId: string,
    query: AuditLogQuery,
  ): Promise<AuditLogListResponse> {
    this.assertCallerManagesOrg(caller, orgId);
    return this.list(
      { tenantId: orgId, action: query.action, actorUserId: query.actorUserId },
      query.cursor,
      query.limit,
    );
  }

  /**
   * Keyset (cursor) pagination on `(occurredAt desc, id desc)` — `id` is a
   * random UUID (`gen_random_uuid()`), not chronologically sortable, so it
   * is the stable tiebreaker only, never the primary sort key.
   * `take: limit + 1` — fetching one extra row is the standard way to know
   * whether a next page exists without a separate `count()` query.
   */
  private async list(
    filter: AuditLogFilter,
    cursor: string | undefined,
    limit: number,
  ): Promise<AuditLogListResponse> {
    const rows = await this.appPrisma.auditLog.findMany({
      where: { tenantId: filter.tenantId, action: filter.action, actorUserId: filter.actorUserId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = page[page.length - 1];

    return {
      data: page.map(toAuditLogDto),
      meta: { nextCursor: hasMore && lastRow ? lastRow.id : null },
    };
  }

  /** Same discriminant as `OrganizationsService`/`RoleLifecycleService` (Part 9's "ownership checks are per-service-method, not centralized"). */
  private assertCallerManagesOrg(caller: RequestUser, orgId: string): void {
    const isPlatformAdmin = caller.role === 'ADMIN';
    const isThatOrgsAdmin =
      caller.organizationId === orgId && caller.orgRole === 'ENTERPRISE_ADMIN';
    if (!isPlatformAdmin && !isThatOrgsAdmin) {
      throw new NotFoundException('Organization not found');
    }
  }
}
