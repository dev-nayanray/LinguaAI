import { createAuthClient, type AuthClient } from '@linguaai/auth-client';

/**
 * One shared client instance per app (E2-T22) — `NEXT_PUBLIC_API_URL` is
 * inlined at build time (Next.js's own rule for `NEXT_PUBLIC_*` vars), so
 * this module has no runtime env-loading concerns beyond that.
 *
 * Explicit `AuthClient` annotation: `request()`'s generic signature makes
 * the inferred return type of `createAuthClient` reference `@linguaai/
 * auth-client`'s internal module path directly, which `tsc` refuses to
 * name portably (TS2742) without this.
 */
export const authClient: AuthClient = createAuthClient(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);
