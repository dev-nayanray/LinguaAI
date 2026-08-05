import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { appDatabaseEnvSchema, loadConfig, type AppDatabaseEnv } from '@linguaai/config';

import {
  APP_PRISMA_CLIENT,
  SERVICE_ROLE_PRISMA_CLIENT,
  ServiceRolePrismaClient,
  createAppPrismaClient,
} from './prisma-clients.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

/**
 * Shared `app_role`/`app_service_role` Prisma client providers (E2-T8,
 * extracted from `AuthModule` in E2-T10 once `UsersModule` also needed
 * them — see `prisma-clients.ts` for why these two roles exist instead of
 * `packages/database`'s shared `getPrismaClient()` singleton). `@Global()`
 * so every feature module can inject `APP_PRISMA_CLIENT`/
 * `SERVICE_ROLE_PRISMA_CLIENT` without each one re-importing this module —
 * imported once, in `AppModule`.
 *
 * Config is loaded (fail-fast, DEPLOYMENT.md §7) inside a provider
 * `useFactory`, not at module-file eval time — `database/index.ts` barrel-
 * exports both this class and the plain `APP_PRISMA_CLIENT`/
 * `SERVICE_ROLE_PRISMA_CLIENT` tokens that every auth/users file imports
 * just for `@Inject()`; a top-level `loadConfig()` call here would run as
 * a side effect of importing the barrel for the tokens alone, crashing
 * plain unit tests (which never set `APP_DATABASE_URL` and never boot this
 * module for real) — confirmed empirically when introducing this module.
 *
 * `TenantContextInterceptor` (E2-T14) is registered globally here, not in
 * `AppModule`, so it ships as part of this module's own contract — anyone
 * importing `DatabaseModule` gets the RLS session-variable pipeline
 * (`tenant-rls.extension.ts` + this interceptor) working end-to-end, not
 * just the raw Prisma client tokens.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: (): AppDatabaseEnv => loadConfig(appDatabaseEnvSchema),
    },
    {
      provide: APP_PRISMA_CLIENT,
      useFactory: (config: AppDatabaseEnv) => createAppPrismaClient(config.APP_DATABASE_URL),
      inject: [DATABASE_CONFIG],
    },
    {
      provide: SERVICE_ROLE_PRISMA_CLIENT,
      useFactory: (config: AppDatabaseEnv) =>
        new ServiceRolePrismaClient(config.APP_SERVICE_ROLE_DATABASE_URL),
      inject: [DATABASE_CONFIG],
    },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT],
})
export class DatabaseModule {}
