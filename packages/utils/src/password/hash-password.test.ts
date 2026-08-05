import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './hash-password.js';

describe('hashPassword / verifyPassword', () => {
  it('produces an Argon2id-tagged hash string, never the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toContain('$argon2id$');
    expect(hash).not.toContain('correct horse battery staple');
  });

  it('verifies the correct password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('produces a different hash each time (random salt per call)', async () => {
    const [a, b] = await Promise.all([hashPassword('same input'), hashPassword('same input')]);
    expect(a).not.toBe(b);
  });

  it('fails closed (returns false, never throws) against a malformed hash', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});
