import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

let prismaSingleton: PrismaClient | undefined;

/**
 * Returns a shared, lazily-created PrismaClient — avoids each caller
 * opening its own connection pool. Framework-specific lifecycle (NestJS
 * `onModuleInit`/`onModuleDestroy`) wraps this in apps/api and services/*,
 * not here — packages/database has no framework dependency.
 */
export function getPrismaClient(): PrismaClient {
  prismaSingleton ??= new PrismaClient();
  return prismaSingleton;
}

/** Test-only: clears the singleton so the next getPrismaClient() call creates a fresh instance. */
export function _resetPrismaClientForTesting(): void {
  prismaSingleton = undefined;
}
