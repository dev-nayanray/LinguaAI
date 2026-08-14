import { Global, Module } from '@nestjs/common';
import type { ServiceRoleDatabaseEnv } from '@linguaai/config';

import { createNotificationServicePrismaClient } from './create-notification-service-prisma-client.js';
import { NOTIFICATION_SERVICE_PRISMA_CLIENT, resolveDatabaseConfig } from './database.config.js';

const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

/**
 * `@Global()` so any feature module (`NotificationModule`'s own dispatcher/
 * preference/log services) can inject `NOTIFICATION_SERVICE_PRISMA_CLIENT`
 * without each one re-importing this module — mirrors `recommendation-engine`'s
 * own `DatabaseModule` shape exactly, just against the service-role client
 * (see `create-notification-service-prisma-client.ts`'s own doc comment for
 * why this service needs BYPASSRLS where `recommendation-engine` doesn't).
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: (): ServiceRoleDatabaseEnv => resolveDatabaseConfig(),
    },
    {
      provide: NOTIFICATION_SERVICE_PRISMA_CLIENT,
      useFactory: (config: ServiceRoleDatabaseEnv) =>
        createNotificationServicePrismaClient(config.APP_SERVICE_ROLE_DATABASE_URL),
      inject: [DATABASE_CONFIG],
    },
  ],
  exports: [NOTIFICATION_SERVICE_PRISMA_CLIENT],
})
export class DatabaseModule {}
