import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { signSpeechSessionToken, verifySpeechSessionToken } from './speech-session-token.js';

const SECRET = 'a-real-secret-value';
const CLAIMS = { sessionId: 'session-1', userId: 'user-1' };

describe('signSpeechSessionToken / verifySpeechSessionToken', () => {
  it('a freshly-signed token verifies successfully for its own sessionId', () => {
    const token = signSpeechSessionToken(CLAIMS, SECRET);

    const result = verifySpeechSessionToken(token, SECRET, CLAIMS.sessionId);

    expect(result).toEqual({ valid: true, claims: CLAIMS });
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const token = signSpeechSessionToken(CLAIMS, SECRET, 60);

    vi.setSystemTime(new Date('2026-01-01T00:01:01.000Z'));
    const result = verifySpeechSessionToken(token, SECRET, CLAIMS.sessionId);

    expect(result).toEqual({ valid: false, reason: 'expired' });
    vi.useRealTimers();
  });

  it('rejects a tampered token (payload modified after signing)', () => {
    const token = signSpeechSessionToken(CLAIMS, SECRET);
    const [, signatureB64] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...CLAIMS, userId: 'attacker', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${signatureB64}`;

    const result = verifySpeechSessionToken(tamperedToken, SECRET, CLAIMS.sessionId);

    expect(result).toEqual({ valid: false, reason: 'invalid-signature' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSpeechSessionToken(CLAIMS, SECRET);

    const result = verifySpeechSessionToken(token, 'a-different-secret', CLAIMS.sessionId);

    expect(result).toEqual({ valid: false, reason: 'invalid-signature' });
  });

  it('rejects a validly-signed token presented against the wrong sessionId', () => {
    const token = signSpeechSessionToken(CLAIMS, SECRET);

    const result = verifySpeechSessionToken(token, SECRET, 'a-different-session');

    expect(result).toEqual({ valid: false, reason: 'session-mismatch' });
  });

  it('rejects a malformed token (no signature part)', () => {
    const result = verifySpeechSessionToken('not-a-real-token', SECRET, CLAIMS.sessionId);

    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('rejects a validly-signed token whose payload is not valid JSON', () => {
    // A genuinely non-JSON payload, but signed with the real secret --
    // exercises the JSON.parse failure path specifically, distinct from
    // the "wrong signature" path the tampered/malformed-shape tests above
    // already cover (signature verification runs first, by design, so an
    // unsigned/mis-signed payload is never even parsed).
    const payloadB64 = Buffer.from('not json at all').toString('base64url');
    const signatureB64 = createHmac('sha256', Buffer.from(SECRET, 'utf8'))
      .update(payloadB64)
      .digest('base64url');
    const token = `${payloadB64}.${signatureB64}`;

    const result = verifySpeechSessionToken(token, SECRET, CLAIMS.sessionId);

    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('defaults to a 60-second TTL when none is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const token = signSpeechSessionToken(CLAIMS, SECRET);

    vi.setSystemTime(new Date('2026-01-01T00:00:59.000Z'));
    expect(verifySpeechSessionToken(token, SECRET, CLAIMS.sessionId).valid).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T00:01:01.000Z'));
    expect(verifySpeechSessionToken(token, SECRET, CLAIMS.sessionId).valid).toBe(false);
    vi.useRealTimers();
  });
});
