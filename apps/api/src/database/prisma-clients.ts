import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@linguaai/database';

import { tenantRlsExtension } from './tenant-rls.extension.js';

export const APP_PRISMA_CLIENT = Symbol('APP_PRISMA_CLIENT');
export const SERVICE_ROLE_PRISMA_CLIENT = Symbol('SERVICE_ROLE_PRISMA_CLIENT');

/** The type every `@Inject(APP_PRISMA_CLIENT)` call site sees — a `PrismaClient` transparently wrapped by `tenantRlsExtension` (E2-T14). */
export type AppPrismaClient = ReturnType<typeof createAppPrismaClient>;

/**
 * `app_role` (RLS-subject) — the standard per-request connection. Deliberately
 * NOT `packages/database`'s shared `getPrismaClient()` singleton, which is
 * wired to `DATABASE_URL` (the migration-owning superuser) — the running
 * application must never connect as that role, or Postgres RLS (E2 Part 9)
 * provides zero real protection (flagged, unresolved until now, in E2-T4's
 * migration comment).
 *
 * A factory, not a class, because `PrismaClient#$extends()` (E2-T14's
 * `tenantRlsExtension`) returns a new composed client type that plain class
 * inheritance can't express — `$extends()` is a composition API, not a
 * subclassing one. `onModuleDestroy` lifecycle (NestJS calls this hook on
 * *any* provider instance that has the method, not only `useClass`
 * providers — confirmed against Nest's own instance-lifecycle handling) is
 * attached via the extension's `client` component instead of a class body.
 */
export function createAppPrismaClient(databaseUrl: string) {
  const base = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return tenantRlsExtension(base);
}

/**
 * `app_service_role` (`BYPASSRLS`) — used only by the small, named set of
 * pre-session code paths Part 9's "Service-role exception" describes:
 * registration, the bootstrap CLI (E2-T5), GDPR erasure, and — extended here,
 * for the identical reason Part 9 already gives for writes — login's
 * pre-auth credential lookup. `User.user_read`'s RLS policy requires
 * `app.current_user_id`/`app.current_org_id`/`app.is_platform_admin`, none
 * of which exist before a caller's identity is established; a plain
 * `app_role` SELECT by email would return zero rows for every login
 * attempt, not just unauthorized ones. This is not a new mechanism, only
 * the same already-approved exception applied to a read the design's own
 * text didn't enumerate — see auth.service.ts's `validateCredentials`.
 */
@Injectable()
export class ServiceRolePrismaClient extends PrismaClient implements OnModuleDestroy {
  constructor(databaseUrl: string) {
    super({ datasources: { db: { url: databaseUrl } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
