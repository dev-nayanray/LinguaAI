import { Global, Module } from '@nestjs/common';
import type { AppRoleDatabaseEnv } from '@linguaai/config';

import { createRecommendationEnginePrismaClient } from './create-recommendation-engine-prisma-client.js';
import { RECOMMENDATION_ENGINE_PRISMA_CLIENT, resolveDatabaseConfig } from './database.config.js';

const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

/**
 * `@Global()` so any feature module (T2's `LearningPlan` generator, T3's
 * `DailyGoal`/weakness-detection services) can inject
 * `RECOMMENDATION_ENGINE_PRISMA_CLIENT` without each one re-importing this
 * module — mirrors `ai-engine`'s own `DatabaseModule`
 * (services/ai-engine/src/database/database.module.ts) shape exactly.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE_CONFIG, useFactory: (): AppRoleDatabaseEnv => resolveDatabaseConfig() },
    {
      provide: RECOMMENDATION_ENGINE_PRISMA_CLIENT,
      useFactory: (config: AppRoleDatabaseEnv) =>
        createRecommendationEnginePrismaClient(config.APP_DATABASE_URL),
      inject: [DATABASE_CONFIG],
    },
  ],
  exports: [RECOMMENDATION_ENGINE_PRISMA_CLIENT],
})
export class DatabaseModule {}
