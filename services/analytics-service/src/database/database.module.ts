import { Global, Module } from '@nestjs/common';
import type { AppRoleDatabaseEnv } from '@linguaai/config';

import { createAnalyticsServicePrismaClient } from './create-analytics-service-prisma-client.js';
import { ANALYTICS_SERVICE_PRISMA_CLIENT, resolveDatabaseConfig } from './database.config.js';

const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

/**
 * `@Global()` so any feature module can inject `ANALYTICS_SERVICE_PRISMA_CLIENT`
 * without each one re-importing this module — mirrors `recommendation-engine`'s
 * own `DatabaseModule` shape exactly (E17 T1).
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE_CONFIG, useFactory: (): AppRoleDatabaseEnv => resolveDatabaseConfig() },
    {
      provide: ANALYTICS_SERVICE_PRISMA_CLIENT,
      useFactory: (config: AppRoleDatabaseEnv) =>
        createAnalyticsServicePrismaClient(config.APP_DATABASE_URL),
      inject: [DATABASE_CONFIG],
    },
  ],
  exports: [ANALYTICS_SERVICE_PRISMA_CLIENT],
})
export class DatabaseModule {}
