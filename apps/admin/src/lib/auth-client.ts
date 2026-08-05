import { createAuthClient } from '@linguaai/auth-client';

/**
 * One shared client instance per app (E2-T22) — `NEXT_PUBLIC_API_URL` is
 * inlined at build time (Next.js's own rule for `NEXT_PUBLIC_*` vars), so
 * this module has no runtime env-loading concerns beyond that.
 */
export const authClient = createAuthClient(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);
