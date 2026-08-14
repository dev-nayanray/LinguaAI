import { appRoleDatabaseEnvSchema, loadConfig, type AppRoleDatabaseEnv } from '@linguaai/config';

export const ANALYTICS_SERVICE_PRISMA_CLIENT = Symbol('ANALYTICS_SERVICE_PRISMA_CLIENT');

/**
 * `app_role`-only (E17 T1) — mirrors `recommendation-engine`'s own
 * `resolveDatabaseConfig()` exactly. This consumer only ever writes to its
 * own `LearningEvent` row, keyed by whatever `userId` the event envelope
 * already carries — it never needs to read another user's `User` row (the
 * way `notification-service` does for `email`), so it has no BYPASSRLS use
 * case at all, the same `appRoleDatabaseEnvSchema` precedent
 * `recommendation-engine`/`ai-engine` already established (ADR-036).
 */
export function resolveDatabaseConfig(): AppRoleDatabaseEnv {
  return loadConfig(appRoleDatabaseEnvSchema);
}
