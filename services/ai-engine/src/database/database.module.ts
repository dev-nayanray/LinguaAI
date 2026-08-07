import { Global, Module } from '@nestjs/common';
import type { AppRoleDatabaseEnv } from '@linguaai/config';

import { createAiEnginePrismaClient } from './create-ai-engine-prisma-client.js';
import { AI_ENGINE_PRISMA_CLIENT, resolveDatabaseConfig } from './database.config.js';

const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

/**
 * `@Global()` so any feature module (OrchestratorModule today, T6's Memory
 * Manager / T7's RAG Retrieval Layer later) can inject
 * `AI_ENGINE_PRISMA_CLIENT` without each one re-importing this module —
 * mirrors apps/api's own `DatabaseModule` (apps/api/src/database/
 * database.module.ts) shape, minus the RLS/service-role machinery that
 * module carries and the ai.* schema domain has no use for (ai.prisma's
 * own header comment: "Not tenant-scoped... no RLS policy").
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE_CONFIG, useFactory: (): AppRoleDatabaseEnv => resolveDatabaseConfig() },
    {
      provide: AI_ENGINE_PRISMA_CLIENT,
      useFactory: (config: AppRoleDatabaseEnv) =>
        createAiEnginePrismaClient(config.APP_DATABASE_URL),
      inject: [DATABASE_CONFIG],
    },
  ],
  exports: [AI_ENGINE_PRISMA_CLIENT],
})
export class DatabaseModule {}
