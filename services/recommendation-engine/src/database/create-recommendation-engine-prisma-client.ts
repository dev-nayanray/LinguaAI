import { PrismaClient } from '@linguaai/database';

/**
 * Connects as `app_role` (`APP_DATABASE_URL`) — never `packages/database`'s
 * own `getPrismaClient()`, which is wired to `DATABASE_URL` (the
 * migration-owning superuser role; that function's own consumers are e2e
 * test setup/cleanup only). `recommendation-engine` is the second real
 * `services/*` application to connect to Postgres at all (`ai-engine` was
 * the first, E5 T4) — the same least-privilege reasoning applies unchanged
 * (ADR-036): a compromised `recommendation-engine` credential should never
 * carry schema-altering, every-table-including-tenant-scoped-ones access,
 * regardless of whether `LearningPlan`/`DailyGoal` happen to carry an RLS
 * policy of their own.
 *
 * Unlike `ai-engine`'s own `createAiEnginePrismaClient`, no field-level
 * encryption extension is composed here — `LearningPlan`/`DailyGoal` carry
 * no PII-equivalent free-text column the way `AIMessage.content` does
 * (`milestones` is structured, non-conversational JSON) — so a bare
 * `PrismaClient` plus the same `onModuleDestroy` composition technique
 * `create-ai-engine-prisma-client.ts` already established (so NestJS's
 * graceful-shutdown hook actually disconnects this client) is sufficient.
 */
export function createRecommendationEnginePrismaClient(databaseUrl: string) {
  const base = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return base.$extends({
    client: {
      onModuleDestroy(this: { $disconnect(): Promise<void> }): Promise<void> {
        return this.$disconnect();
      },
    },
  });
}
