import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A short-lived, narrowly-scoped signed token authorizing a client's
 * direct WebSocket connection to `speech-service` (E10 design doc §6.2,
 * ADR-043) — `apps/api` signs it when a `POST /v1/speaking-sessions` call
 * succeeds; `speech-service` verifies it locally at WebSocket handshake,
 * with zero network round-trip back to `apps/api` (a deliberate latency
 * decision — PERFORMANCE.md §2's own tight 300ms transport-overhead
 * budget has no room for a synchronous cross-service verification call on
 * every connect/reconnect).
 *
 * Deliberately not a full JWT (`jsonwebtoken`, already a dependency
 * elsewhere in this monorepo) — this package is kept dependency-free
 * (mirroring `hmac-hash.ts`'s own already-established convention of
 * hand-rolled `node:crypto` primitives for a narrow, internal purpose),
 * and the claim set here is fixed and tiny (`sessionId`, `userId`, `exp`),
 * with no need for JWT's broader header/algorithm-negotiation surface.
 */

const TOKEN_PART_SEPARATOR = '.';

export interface SpeechSessionTokenClaims {
  sessionId: string;
  userId: string;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(payloadB64).digest('base64url');
}

/** `ttlSeconds` defaults to 60 — long enough for a client to receive the token and open the WebSocket, short enough that a leaked token (e.g. via a logged URL) is worthless within a minute. */
export function signSpeechSessionToken(
  claims: SpeechSessionTokenClaims,
  secret: string,
  ttlSeconds = 60,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = base64UrlEncode(JSON.stringify({ ...claims, exp }));
  const signatureB64 = sign(payloadB64, secret);
  return `${payloadB64}${TOKEN_PART_SEPARATOR}${signatureB64}`;
}

export type SpeechSessionTokenVerification =
  | { valid: true; claims: SpeechSessionTokenClaims }
  | { valid: false; reason: 'malformed' | 'invalid-signature' | 'expired' | 'session-mismatch' };

/**
 * `expectedSessionId` is required, not optional — the token is only ever
 * presented at a URL/handshake that already names the session
 * (`/realtime/speaking-sessions/:sessionId`), so verification also
 * confirms the token was actually issued *for this session*, not merely
 * that it is validly signed for some session. A token signed for session
 * A presented against session B's own handshake fails with
 * `session-mismatch`, never silently accepted.
 */
export function verifySpeechSessionToken(
  token: string,
  secret: string,
  expectedSessionId: string,
): SpeechSessionTokenVerification {
  const parts = token.split(TOKEN_PART_SEPARATOR);
  if (parts.length !== 2) {
    return { valid: false, reason: 'malformed' };
  }
  const [payloadB64, signatureB64] = parts as [string, string];

  const expectedSignature = Buffer.from(sign(payloadB64, secret), 'base64url');
  const providedSignature = Buffer.from(signatureB64, 'base64url');
  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return { valid: false, reason: 'invalid-signature' };
  }

  let parsed: { sessionId?: unknown; userId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (
    typeof parsed.sessionId !== 'string' ||
    typeof parsed.userId !== 'string' ||
    typeof parsed.exp !== 'number'
  ) {
    return { valid: false, reason: 'malformed' };
  }

  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }
  if (parsed.sessionId !== expectedSessionId) {
    return { valid: false, reason: 'session-mismatch' };
  }

  return { valid: true, claims: { sessionId: parsed.sessionId, userId: parsed.userId } };
}
