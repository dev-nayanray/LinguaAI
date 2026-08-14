import type { RateLimitConfig } from '../../common/rate-limit/index.js';

/**
 * `@RateLimit(...)` config for `GET /v1/certificates/verify/:token` (E20
 * T2, design doc §3.3) — the exact "10 requests per IP per 5 minutes"
 * spec `exams.prisma`'s own header comment already committed to at E4 T8,
 * built against for the first time here. By-IP only, deliberately no
 * `byIdentifier` counter keyed by the token itself (design doc §8's own
 * "Alternatives considered": a token-keyed counter would let an attacker
 * cheaply exhaust a *specific* certificate holder's own verification
 * attempts by supplying their real token repeatedly — a real,
 * self-inflicted denial-of-service surface with no corresponding
 * security benefit, unlike login/MFA's own `byIdentifier` counters, which
 * defend against credential-guessing across many *different*
 * identifiers, not repeated presentation of one already-known-valid
 * token).
 */
export const CERTIFICATE_VERIFY_RATE_LIMIT: RateLimitConfig = {
  keyPrefix: 'certificate-verify',
  byIp: { max: 10, windowMs: 5 * 60 * 1000 },
};
