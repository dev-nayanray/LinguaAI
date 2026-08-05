import { getPrismaClient, PrismaClient } from '@linguaai/database';

import { computeStats, type LatencyStats } from './percentiles.js';

export interface RlsLatencyResult {
  orgDetailRead: LatencyStats;
  membershipListRead: LatencyStats;
}

/**
 * PERFORMANCE.md §4: "hot-path query p95 < 50ms at the database layer" —
 * measured here as pure DB round-trip time via a direct `appPrisma` call
 * (the real `app_role` connection, same as production), not the full HTTP
 * stack (`auth-load.ts` measures that separately for the Standard CRUD
 * class) — the budget is explicitly scoped to the database layer, and
 * conflating it with HTTP/serialization overhead would answer a different
 * question. Reproduces `tenant-rls.extension.ts`'s own "SET + query, same
 * transaction" mechanism inline (not imported — `apps/api/src` is not a
 * package other code consumes, per CLAUDE.md's own layout rule) rather
 * than approximating it, since an approximation here would be measuring
 * something other than what RLS-protected requests actually pay.
 */
export async function measureRlsQueryLatency(
  orgIds: string[],
  iterations: number,
  appDatabaseUrl: string,
): Promise<RlsLatencyResult> {
  const appPrisma = new PrismaClient({ datasources: { db: { url: appDatabaseUrl } } });
  const setupPrisma = getPrismaClient();

  try {
    const orgDetailDurations: number[] = [];
    const membershipDurations: number[] = [];

    for (let i = 0; i < iterations; i += 1) {
      const orgId = orgIds[i % orgIds.length]!;
      const admin = await setupPrisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: orgId, orgRole: 'ENTERPRISE_ADMIN' },
      });

      const orgStart = performance.now();
      await appPrisma.$transaction([
        appPrisma.$executeRaw`SELECT
          set_config('app.current_user_id', ${admin.userId}, true),
          set_config('app.is_platform_admin', 'false', true),
          set_config('app.current_org_id', ${orgId}, true),
          set_config('app.caller_org_role', 'ENTERPRISE_ADMIN', true)`,
        appPrisma.organization.findUnique({ where: { id: orgId } }),
      ]);
      orgDetailDurations.push(performance.now() - orgStart);

      const memberStart = performance.now();
      await appPrisma.$transaction([
        appPrisma.$executeRaw`SELECT
          set_config('app.current_user_id', ${admin.userId}, true),
          set_config('app.is_platform_admin', 'false', true),
          set_config('app.current_org_id', ${orgId}, true),
          set_config('app.caller_org_role', 'ENTERPRISE_ADMIN', true)`,
        appPrisma.organizationMembership.findMany({ where: { organizationId: orgId } }),
      ]);
      membershipDurations.push(performance.now() - memberStart);
    }

    return {
      orgDetailRead: computeStats(orgDetailDurations),
      membershipListRead: computeStats(membershipDurations),
    };
  } finally {
    await appPrisma.$disconnect();
  }
}
