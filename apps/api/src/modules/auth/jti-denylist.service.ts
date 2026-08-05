import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { RATE_LIMIT_REDIS } from '../../common/rate-limit/index.js';

const DENYLIST_KEY_PREFIX = 'jti-denylist:';
/**
 * Matches `JWT_ACCESS_TTL`'s documented value (Part 8: "short-lived JWT (15
 * min)") — a plain constant rather than dynamically parsed from the
 * `JWT_ACCESS_TTL` env var, to avoid taking on a new direct dependency on
 * the `ms` package purely for this (it's only available transitively, via
 * `@nestjs/jwt`). If `JWT_ACCESS_TTL` is ever changed, this needs updating
 * alongside it — the same class of coupling `PASSWORD_RESET_TOKEN_TTL_MS`
 * already has with Part 5's documented policy in `auth.service.ts`. A
 * denylist entry only ever needs to outlive the token it denies: once the
 * token's own `exp` claim has passed, passport-jwt already rejects it
 * before `JwtStrategy.validate()` runs, making the entry redundant from
 * that point on regardless of whether it's still present.
 */
const DENYLIST_TTL_SECONDS = 15 * 60;

/**
 * Closes a real gap E2-T28's security review found: Part 8 documents "a
 * revoked session's access tokens are also checked against a short-TTL
 * Redis denylist (keyed by JWT `jti`) so revocation doesn't have to wait
 * out a 15-minute access-token TTL" — this was never actually built.
 * `tokensValidAfter` (E2-T9) is the *general* mechanism for claim-affecting
 * changes, but is deliberately per-user, not per-session (Part 8's own
 * text) — using it for an ordinary single-device logout would invalidate
 * every other active session too. This is the narrower mechanism Part 8
 * always intended for that case specifically.
 *
 * Reuses `RateLimitModule`'s own Redis connection (`RATE_LIMIT_REDIS`)
 * rather than opening a second one — its fail-fast tuning
 * (`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, E2-T21) suits
 * this service too, just in the opposite failure direction. Rate limiting
 * fails *closed* (Part 11, `rate-limiter.ts`'s own doc comment) because
 * blocking new requests on a narrow set of auth endpoints is the safe
 * default. This fails **open** deliberately: the alternative — every
 * already-authenticated request across the *entire* API failing whenever
 * Redis has a blip — is a far larger blast radius than "immediate
 * revocation is best-effort during a Redis outage, while
 * `tokensValidAfter`/refresh-token revocation still apply regardless." A
 * documented deviation from Part 11's fail-closed default, not an
 * oversight or an inconsistency with it.
 */
@Injectable()
export class JtiDenylistService {
  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: Redis) {}

  /** Called at session-revocation time (`AuthService.revokeSession`/`revokeAllSessions`) with that session's most-recently-issued `jti`. */
  async add(jti: string): Promise<void> {
    try {
      await this.redis.set(`${DENYLIST_KEY_PREFIX}${jti}`, '1', 'EX', DENYLIST_TTL_SECONDS);
    } catch {
      // Best-effort — see class doc comment. The session is already
      // revoked at the database layer (RefreshToken/Session.revokedAt) by
      // the time this runs; a failed denylist write means only this one
      // already-issued access token stays valid until its own natural
      // expiry, not that revocation silently failed altogether.
    }
  }

  /** Called on every `AuthGuard('jwt')`-protected request (`JwtStrategy.validate()`). */
  async isDenylisted(jti: string): Promise<boolean> {
    try {
      const value = await this.redis.get(`${DENYLIST_KEY_PREFIX}${jti}`);
      return value !== null;
    } catch {
      return false;
    }
  }
}
