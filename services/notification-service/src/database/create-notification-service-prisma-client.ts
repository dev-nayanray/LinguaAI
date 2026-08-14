import { PrismaClient } from '@linguaai/database';

/**
 * Connects as `app_service_role` (`APP_SERVICE_ROLE_DATABASE_URL`,
 * `BYPASSRLS`) — never `app_role`, and never `packages/database`'s own
 * `getPrismaClient()` (wired to `DATABASE_URL`, the migration-owning
 * superuser; that function's own consumers are e2e test setup/cleanup
 * only). Unlike `recommendation-engine`/`ai-engine` (`appRoleDatabaseEnvSchema`,
 * ordinary `app_role`), `notification-service` genuinely needs BYPASSRLS:
 * its own `NotificationLog`/`NotificationPreference` tables carry no RLS
 * policy at all, but every real event dispatch needs `User.email` for an
 * arbitrary `userId` from a background BullMQ worker with no per-request
 * session context to set `app.current_user_id` against — `User` carries
 * `FORCE ROW LEVEL SECURITY` (E2's identity RLS policies), so a plain
 * `app_role` connection would see zero rows for a user that isn't itself.
 * `serviceRoleDatabaseEnvSchema`'s own doc comment names this exact case.
 *
 * No field-level encryption extension composed here (unlike
 * `create-ai-engine-prisma-client.ts`) — `NotificationLog`/
 * `NotificationPreference` carry no PII-equivalent free-text column, and
 * `User.email` is read-only from here, never written.
 */
export function createNotificationServicePrismaClient(databaseUrl: string) {
  const base = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return base.$extends({
    client: {
      onModuleDestroy(this: { $disconnect(): Promise<void> }): Promise<void> {
        return this.$disconnect();
      },
    },
  });
}
