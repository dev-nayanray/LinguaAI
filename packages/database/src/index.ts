import { PrismaClient } from '@prisma/client';

import { withAiMessageEncryption } from './ai-message-encryption-extension.js';

export * from '@prisma/client';
export * from './encryption/index.js';
/**
 * Re-exported so a consumer that must connect as a different Postgres role
 * than `getPrismaClient()`'s own `DATABASE_URL` (the migration-owning
 * superuser — e.g. any real `services/*` application, per ADR-036) can
 * still compose the same `AIMessage.content` encryption onto its own,
 * correctly-privileged `PrismaClient` instance, exactly as `apps/api`
 * already composes its own `tenantRlsExtension` this way rather than using
 * `getPrismaClient()`.
 */
export { withAiMessageEncryption } from './ai-message-encryption-extension.js';

function createExtendedPrismaClient() {
  return withAiMessageEncryption(new PrismaClient());
}

let prismaSingleton: ReturnType<typeof createExtendedPrismaClient> | undefined;

/**
 * Returns a shared, lazily-created PrismaClient — avoids each caller
 * opening its own connection pool. Framework-specific lifecycle (NestJS
 * `onModuleInit`/`onModuleDestroy`) wraps this in apps/api and services/*,
 * not here — packages/database has no framework dependency.
 *
 * Extended with transparent `AIMessage.content` field-level encryption
 * (ADR-029) — every consumer gets this by construction, not by
 * remembering to opt in.
 */
export function getPrismaClient(): ReturnType<typeof createExtendedPrismaClient> {
  prismaSingleton ??= createExtendedPrismaClient();
  return prismaSingleton;
}

/** Test-only: clears the singleton so the next getPrismaClient() call creates a fresh instance. */
export function _resetPrismaClientForTesting(): void {
  prismaSingleton = undefined;
}
