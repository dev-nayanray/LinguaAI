import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimitByIdentifierRule extends RateLimitRule {
  /** Resolves the per-caller key (email, userId, ...) this route's second counter is scoped to — returning `null` skips that counter for this request (e.g. a malformed body with no email at all; the by-IP counter alone still applies). */
  extractIdentifier: (req: Request & { user?: { userId: string } }) => string | null;
}

export interface RateLimitConfig {
  /** Namespaces this route's Redis keys — distinct routes never share a counter even if their numeric limits happen to match. */
  keyPrefix: string;
  byIp: RateLimitRule;
  /** A second counter scoped to a request-specific identifier, not just IP — catches distributed/credential-stuffing attempts a single-IP counter alone would miss (SECURITY.md §2). Optional: routes with no natural per-caller identifier (none here, but the type allows it) apply only the by-IP counter. */
  byIdentifier?: RateLimitByIdentifierRule;
}

/**
 * `@RateLimit(...)` — opt-in per route, read by `RateLimitGuard` (E2-T21).
 * Same `SetMetadata` pattern as `@Roles(...)`/`RolesGuard` (E2-T14) — an
 * implementation detail of an already-accepted requirement (SECURITY.md §2:
 * "rate limiting + progressive backoff on auth endpoints"), not a new
 * architecture decision.
 */
export const RateLimit = (config: RateLimitConfig): MethodDecorator =>
  SetMetadata(RATE_LIMIT_KEY, config);
