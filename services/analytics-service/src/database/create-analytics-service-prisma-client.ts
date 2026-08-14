import { PrismaClient } from '@linguaai/database';

/**
 * Connects as `app_role` (`APP_DATABASE_URL`) — never `packages/database`'s
 * own `getPrismaClient()` (wired to `DATABASE_URL`, the migration-owning
 * superuser; that function's own consumers are e2e test setup/cleanup
 * only). `analytics-service` is this platform's real, second `app_role`-only
 * `services/*` consumer of this shape, after `recommendation-engine` (E7
 * T2) — the same least-privilege reasoning applies unchanged (ADR-036).
 *
 * No field-level encryption extension composed here — `LearningEvent`'s
 * own `payload` column carries an opaque `Json` envelope, not a
 * PII-equivalent free-text column the way `AIMessage.content` does; this
 * consumer's own job is to persist the envelope verbatim, not interpret
 * or redact it.
 */
export function createAnalyticsServicePrismaClient(databaseUrl: string) {
  const base = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return base.$extends({
    client: {
      onModuleDestroy(this: { $disconnect(): Promise<void> }): Promise<void> {
        return this.$disconnect();
      },
    },
  });
}
