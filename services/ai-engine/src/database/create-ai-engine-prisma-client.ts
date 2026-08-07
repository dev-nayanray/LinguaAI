import { PrismaClient, withAiMessageEncryption } from '@linguaai/database';

/**
 * Connects as `app_role` (`APP_DATABASE_URL`) — never `packages/database`'s
 * own `getPrismaClient()`, which is wired to `DATABASE_URL` (the
 * migration-owning superuser role; that function's own consumers are e2e
 * test setup/cleanup only, confirmed by grep, never production runtime
 * code). ai-engine is the first real `services/*` application to connect
 * to Postgres at all (ai.prisma's own domain has no RLS policy to
 * enforce), but the least-privilege reason `apps/api` avoids the
 * superuser role is broader than RLS alone — `app_role` is the platform's
 * "this is a real running application, not a migration tool" role, and a
 * compromised ai-engine credential should never carry schema-altering,
 * every-table-including-tenant-scoped-ones access (ADR-036).
 *
 * Composed with the same `AIMessage.content` field-level encryption
 * (ADR-029) `getPrismaClient()` bundles — applied directly here since
 * `getPrismaClient()` itself is pinned to the wrong role for this
 * service — plus the same `onModuleDestroy` composition technique
 * `apps/api`'s own `tenantRlsExtension` uses (apps/api/src/database/
 * tenant-rls.extension.ts), so NestJS's graceful-shutdown hook actually
 * disconnects this client.
 */
export function createAiEnginePrismaClient(databaseUrl: string) {
  const base = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return withAiMessageEncryption(base).$extends({
    client: {
      onModuleDestroy(this: { $disconnect(): Promise<void> }): Promise<void> {
        return this.$disconnect();
      },
    },
  });
}
