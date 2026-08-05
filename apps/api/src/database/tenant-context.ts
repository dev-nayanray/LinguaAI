import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The four Part 9 RLS session values for the request currently executing,
 * resolved from the caller's already-verified JWT claims (never
 * client-supplied directly) — see `tenant-context.interceptor.ts`, which is
 * the sole writer of this store, and `tenant-rls.extension.ts`, which is
 * the sole reader.
 */
export interface TenantContext {
  userId: string;
  organizationId: string | null;
  callerOrgRole: string | null;
  isPlatformAdmin: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with `context` visible to `getTenantContext()` for the
 * duration of `fn`, including everything it awaits — same propagation
 * mechanism `packages/observability`'s `withCorrelation` already uses for
 * trace context.
 *
 * `fn` is always invoked through an internal `async` boundary (`async ()
 * => fn()`), even if the caller passes a plain non-async arrow function —
 * confirmed empirically, against a real Prisma client and real Postgres
 * (a throwaway spike script, deleted after use), that
 * `storage.run(context, () => appPrisma.someQuery())` — a non-async
 * callback that returns a promise directly, without an `await` inside it
 * — does **not** reliably propagate the `AsyncLocalStorage` context into
 * that query's own continuation, while `storage.run(context, async () =>
 * { ... await ...; })` does. This appears specific to how Prisma's own
 * query-engine promises resume (a hand-rolled thenable/microtask
 * reproduction of the same shape did *not* reproduce the loss, so it
 * isn't a general "any non-async callback" fact about Node's
 * `AsyncLocalStorage` — there is no faithful pure-unit-test regression
 * check for this without a real Prisma call). Production code never calls
 * this function directly (only `tenant-context.interceptor.ts` does, once
 * per request, via `next.handle().subscribe(...)` — not a returned
 * promise — which was never subject to this), so the bug never affected
 * shipped behavior — but any test or future caller (background job, CLI
 * script) invoking this directly needs the guarantee this internal wrap
 * provides, not a "remember to wrap your callback in `async`" convention
 * that's easy to get wrong exactly like this.
 */
export async function runWithTenantContext<T>(context: TenantContext, fn: () => T): Promise<T> {
  return storage.run(context, async () => fn());
}

/** `undefined` outside any request `tenant-context.interceptor.ts` has wrapped — e.g. at module load time, or for a request whose guards rejected it before the interceptor phase ever ran. */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
