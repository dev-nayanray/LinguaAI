import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';

/**
 * Argon2id per SECURITY.md §2 — explicit, not relying on the library's
 * current default (even though Argon2id happens to already be it), since a
 * future library version silently changing its default must never silently
 * change what this project hashes with. Shared by the bootstrap-admin CLI
 * (packages/database, E2-T5) and apps/api's AuthModule (E2-T8) — the same
 * hash must be producible/verifiable from both, so this lives in
 * packages/utils rather than being duplicated (CLAUDE.md: "Code that is
 * used by more than one app/service belongs in packages/, never
 * duplicated").
 *
 * `Algorithm` is an ambient `const enum` — its members can't be referenced
 * as values across modules under this project's `isolatedModules` setting
 * (TS2748), so the literal is used directly, matching `Argon2id = 2` in
 * @node-rs/argon2's own index.d.ts, with `Algorithm` imported type-only
 * purely to assert that literal's meaning.
 */
const ARGON2ID_OPTIONS = { algorithm: 2 as Algorithm };

/** Hashes a plaintext password. Never store or log the plaintext input. */
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2ID_OPTIONS);
}

/**
 * Verifies a plaintext password against a stored Argon2id hash. Returns
 * `false` (never throws) for a malformed/foreign hash — a corrupt
 * `passwordHash` value must fail closed, not crash the login attempt.
 */
export async function verifyPassword(hash_: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(hash_, plaintext);
  } catch {
    return false;
  }
}
