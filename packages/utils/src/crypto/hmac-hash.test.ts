import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hmacHash } from './hmac-hash.js';

describe('hmacHash', () => {
  const key = randomBytes(32).toString('base64');

  it('produces a deterministic hash for the same value and key', () => {
    expect(hmacHash('user@test.local', key)).toBe(hmacHash('user@test.local', key));
  });

  it('is case-insensitive (matches Citext email semantics)', () => {
    expect(hmacHash('User@Test.Local', key)).toBe(hmacHash('user@test.local', key));
  });

  it('produces a different hash for a different key (the actual point of using HMAC over a bare hash)', () => {
    const otherKey = randomBytes(32).toString('base64');
    expect(hmacHash('user@test.local', key)).not.toBe(hmacHash('user@test.local', otherKey));
  });

  it('never contains the plaintext email in its output', () => {
    expect(hmacHash('user@test.local', key)).not.toContain('user@test.local');
  });
});
