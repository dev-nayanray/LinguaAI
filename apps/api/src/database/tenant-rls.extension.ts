import { Prisma, type PrismaClient } from '@linguaai/database';

import { getTenantContext, type TenantContext } from './tenant-context.js';

/**
 * A syntactically valid UUID no real `Organization` row can ever have
 * (UUIDs here are `@default(uuid())` — randomly generated, never this
 * value) — used in place of `NULL` for `app.current_org_id` when the
 * caller has no organization, so every RLS policy's `current_setting(...)
 * ::uuid` cast always has something castable to compare against.
 */
const NIL_ORG_ID = '00000000-0000-0000-0000-000000000000';
/** No real `OrgRole` enum value — used in place of `NULL` for `app.caller_org_role`; compared as plain text (`= 'ENTERPRISE_ADMIN'`) by every policy, never cast, so any non-matching string is safe. */
const NO_ORG_ROLE = '__none__';

/**
 * Builds the single `SELECT set_config(...), set_config(...), ...`
 * statement for a request's tenant context. Extracted as a pure function
 * (no Prisma-client-instance involvement) so its logic is directly
 * unit-testable without mocking Prisma's `$extends` machinery.
 *
 * Always sets all four variables explicitly — never omits one to "leave it
 * NULL" and never passes a bare `null` value. Two things were verified
 * empirically against real Postgres (throwaway spike scripts, deleted
 * after use — same discipline as T13's `SET LOCAL $1` check):
 *
 * 1. `set_config(name, NULL, true)` does **not** produce a real SQL NULL —
 *    it silently coerces to `''`, and `current_setting(...)::uuid` then
 *    throws `invalid input syntax for type uuid`.
 * 2. Omitting the call entirely (relying on the session variable never
 *    having been set, so `current_setting(x, true)` returns real NULL) is
 *    *not* safe either under Prisma's connection pooling: a prior request
 *    on the same physical (pooled) connection may have `set_config`'d a
 *    real value with `is_local = true`, and that is documented to revert
 *    only at the end of *its own* transaction — but empirically, reusing
 *    the connection for a *later*, unrelated request's mini-transaction
 *    intermittently still observed the earlier value (reproduced via the
 *    full e2e suite: passed in isolation, failed when run after other
 *    tenant contexts had used the same pool). Rather than depend on that
 *    reversion guarantee across pooled reuse, every call sets every
 *    variable explicitly, every time — nullable fields get a sentinel
 *    (`NIL_ORG_ID`, `NO_ORG_ROLE`) that can never match a real row, so no
 *    call ever depends on a *previous* call's cleanup.
 */
export function buildSetSessionVarsSql(ctx: TenantContext): Prisma.Sql {
  const clauses = [
    Prisma.sql`set_config('app.current_user_id', ${ctx.userId}, true)`,
    Prisma.sql`set_config('app.is_platform_admin', ${String(ctx.isPlatformAdmin)}, true)`,
    Prisma.sql`set_config('app.current_org_id', ${ctx.organizationId ?? NIL_ORG_ID}, true)`,
    Prisma.sql`set_config('app.caller_org_role', ${ctx.callerOrgRole ?? NO_ORG_ROLE}, true)`,
  ];
  return Prisma.sql`SELECT ${Prisma.join(clauses)}`;
}

/**
 * Postgres RLS (Part 9's authoritative layer) reads four `current_setting`
 * session variables that only exist on the Postgres connection they were
 * `set_config`'d on for the transaction they were set within — Prisma pools
 * connections per query, so a bare "set once per request" can't guarantee a
 * *later* query lands on the same connection (T13's `complete_mfa_enrollment`
 * fix already worked around this once, by hand, for a single call site: see
 * `mfa.service.ts`'s history). This extension generalizes that fix to every
 * `app_role` query transparently: each intercepted operation is batched
 * together with a `set_config` of the calling request's tenant context
 * (`tenant-context.ts`'s `AsyncLocalStorage`) inside one
 * `$transaction([...])` array — the same "SET + call, same transaction"
 * shape T5/T9/T13 already proved works, generalized instead of hand-applied
 * per call site.
 *
 * Several things were verified empirically against real Postgres before
 * writing this (throwaway spike scripts, deleted after use — same
 * discipline as T13's `SET LOCAL $1` check) — see `buildSetSessionVarsSql`
 * for why every session variable is always set explicitly, with a sentinel
 * for null fields, rather than passing `null` or omitting the call.
 *
 * Separately: wrapping *every* operation in its own mini-transaction means
 * an operation that is itself part of an application-level multi-statement
 * `$transaction([...])` (e.g. `auth.service.ts`'s old `revokeSession`)
 * silently loses the atomicity between its statements — each element gets
 * independently re-wrapped rather than running together. Call sites that
 * need multiple `app_role` writes to be atomic must use a single raw SQL
 * statement (a CTE), not Prisma's `$transaction([...])` array — see
 * `revokeSession`.
 *
 * Requests with no tenant context (pre-session calls that go through
 * `app_role` — none, as of E2-T14; everything pre-session uses
 * `app_service_role`, see `prisma-clients.ts`) pass through unmodified;
 * RLS then fails closed (`current_setting(..., true)` returns NULL) for
 * anything that unexpectedly does.
 */
export function tenantRlsExtension<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'tenant-rls-context',
    client: {
      // `this` here is Prisma's own extended-client binding (not the
      // closure-captured `client` parameter) — using it, rather than the
      // base client, means calling `.onModuleDestroy()` on the object this
      // function returns disconnects through that same object, not a
      // different (if connection-sharing) instance a test's `jest.spyOn`
      // wouldn't observe. Typed structurally (not `PrismaClient` itself) —
      // the extended client's real type lacks some base-client members
      // (e.g. `$on`) that `$disconnect` doesn't need.
      onModuleDestroy(this: { $disconnect(): Promise<void> }): Promise<void> {
        return this.$disconnect();
      },
    },
    query: {
      async $allOperations({ args, query }) {
        const ctx = getTenantContext();
        if (!ctx) {
          return query(args);
        }

        const [, result] = await client.$transaction([
          client.$executeRaw(buildSetSessionVarsSql(ctx)),
          query(args),
        ]);
        return result;
      },
    },
  });
}
