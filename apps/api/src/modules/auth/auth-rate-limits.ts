import type { RateLimitConfig } from '../../common/rate-limit/index.js';

/**
 * `@RateLimit(...)` configs for the auth endpoints Part 6 marks "rate-limited
 * class" (E2-T21). No numeric threshold is specified anywhere in the design
 * docs — only qualitative language ("rate limiting + progressive backoff",
 * SECURITY.md §2) plus the already-built MFA-specific 5-attempts/10-minute
 * lockout (`mfa.service.ts`'s `enforceLockout`, E2-T13, a separate,
 * additive mechanism scoped to the MFA step specifically, not replaced by
 * this). These numbers are this task's own flagged, reasonable choice, not
 * derived from the doc:
 *
 * - `LOGIN_RATE_LIMIT`/`MFA_VERIFY_RATE_LIMIT` share the same by-IP
 *   threshold per Part 8's explicit text: "`/v1/auth/mfa/verify` join[s]
 *   the same stricter Redis-backed rate-limit class as login." They use
 *   distinct `keyPrefix`es (separate Redis counters) even so — "same
 *   class" reads as "same policy tier," not "share one counter," since a
 *   login-brute-force attacker shouldn't be able to lock a legitimate
 *   user out of `mfa/verify` (or vice versa) by exhausting a counter
 *   neither endpoint actually owns.
 *
 *   `MFA_VERIFY_RATE_LIMIT`'s by-*identifier* threshold is deliberately
 *   NOT identical to login's (10/15min here, vs. 5/15min for login) —
 *   confirmed empirically that setting it to the same 5 pre-empted
 *   `mfa.service.ts`'s own, already-built, already-tested DB-backed
 *   lockout (E2-T13: 5 failures/10min → 403, "locked out even with the
 *   correct code"), since this Redis guard runs *before* the controller
 *   method and would intercept the 6th attempt with a generic 429 before
 *   `MfaService.completeEnrollment`'s own lockout check ever ran —
 *   silently breaking that task's own test and turning its specific,
 *   security-meaningful 403 signal into an indistinguishable-from-any-
 *   other-route 429. Setting this counter's threshold clearly above 5
 *   keeps the DB lockout as the primary, more precise mechanism for this
 *   endpoint specifically, with the Redis layer as a genuine backstop
 *   (e.g. against a caller cycling through many *different* codes fast
 *   enough, or across multiple lockout-window resets) rather than a
 *   competing mechanism racing to answer the same question first.
 *
 *   The by-IP threshold (2000/15min) is deliberately a coarse
 *   volumetric/DDoS backstop, not a meaningful per-user throttle — the
 *   by-identifier one (5/15min) is the actual credential-guessing
 *   defense, and real production traffic from a shared corporate NAT
 *   can legitimately produce a lot of login volume from one IP. Confirmed
 *   empirically (not just reasoned about) that this matters operationally,
 *   not only in theory: a first attempt at 20/15min, then 300/15min, both
 *   still made this codebase's own full e2e suite flaky — one shared
 *   test-runner IP across organizations/role-lifecycle/audit/password-reset/
 *   oauth/rate-limit specs (register→login fixture setup, used pervasively)
 *   adds up fast within one 15-minute window, especially across repeated
 *   local/CI runs. The by-identifier counter is unaffected by this, since
 *   every test uses a freshly randomized email that never accumulates
 *   across runs — it remains the real, tight brute-force defense
 *   regardless of how high the by-IP number needs to be to stay out of
 *   this suite's own way.
 * - `PASSWORD_RESET_REQUEST_RATE_LIMIT` is deliberately looser on identity
 *   (3/hour per email — this endpoint is already enumeration-resistant
 *   and idempotent-shaped, E2-T19, so the bar here is token-creation/spam
 *   volume, not credential-guessing precision) and generous on IP
 *   (1000/hour) for the identical shared-test-IP reason above.
 *
 * `password-reset/confirm` and `register` are **not** rate-limited here —
 * Part 6 doesn't mark either "rate-limited class," `confirm`'s single-use,
 * 256-bit token makes brute-forcing it impractical regardless, and
 * `register`'s own duplicate-email 409 already bounds abuse somewhat.
 *
 * `MFA_CHALLENGE_RATE_LIMIT` (E2-T22) — Part 6's third "rate-limited +
 * lockout class" endpoint, `/v1/auth/mfa/challenge`, closing the gap flagged
 * since E2-T13/T20/T21. Same by-IP tier as the rest of this class. No
 * `req.user` exists at this pre-session point (unlike `mfa/verify`, which
 * runs behind `AuthGuard('jwt')`) — the identifier is the raw
 * `challengeToken` from the request body instead, the closest analogue to
 * "the thing identifying who's being targeted" this endpoint has before the
 * token is even looked up. Threshold (10, matching `MFA_VERIFY_RATE_LIMIT`)
 * for the identical reason documented above: `MfaService.verifyChallengeCode`
 * shares `mfa/verify`'s own DB-backed 5-attempt lockout (keyed by `userId`,
 * via the same `MfaVerificationAttempt` table), which must stay the primary,
 * more precise defense for a wrong-code guess; this Redis layer is a
 * distributed backstop, not a competing mechanism.
 */
const LOGIN_CLASS_IP_RULE = { max: 2000, windowMs: 15 * 60 * 1000 };
const LOGIN_CLASS_IDENTIFIER_RULE = { max: 5, windowMs: 15 * 60 * 1000 };

function emailFromBody(req: { body?: Record<string, unknown> }): string | null {
  const email = req.body?.email;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  keyPrefix: 'login',
  byIp: LOGIN_CLASS_IP_RULE,
  byIdentifier: { ...LOGIN_CLASS_IDENTIFIER_RULE, extractIdentifier: emailFromBody },
};

export const MFA_VERIFY_RATE_LIMIT: RateLimitConfig = {
  keyPrefix: 'mfa-verify',
  byIp: LOGIN_CLASS_IP_RULE,
  byIdentifier: {
    max: 10,
    windowMs: 15 * 60 * 1000,
    extractIdentifier: (req) => req.user?.userId ?? null,
  },
};

export const PASSWORD_RESET_REQUEST_RATE_LIMIT: RateLimitConfig = {
  keyPrefix: 'password-reset-request',
  byIp: { max: 1000, windowMs: 60 * 60 * 1000 },
  byIdentifier: { max: 3, windowMs: 60 * 60 * 1000, extractIdentifier: emailFromBody },
};

function challengeTokenFromBody(req: { body?: Record<string, unknown> }): string | null {
  const token = req.body?.challengeToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export const MFA_CHALLENGE_RATE_LIMIT: RateLimitConfig = {
  keyPrefix: 'mfa-challenge',
  byIp: LOGIN_CLASS_IP_RULE,
  byIdentifier: { max: 10, windowMs: 15 * 60 * 1000, extractIdentifier: challengeTokenFromBody },
};
