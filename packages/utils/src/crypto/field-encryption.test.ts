import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decodeEncryptionKey, decryptField, encryptField } from './field-encryption.js';

describe('field encryption', () => {
  const key = randomBytes(32);

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptField(plaintext, key);
    expect(decryptField(encrypted, key)).toBe(plaintext);
  });

  it('never contains the plaintext in the encrypted output', () => {
    const plaintext = 'a very specific totp secret value';
    const encrypted = encryptField(plaintext, key);
    expect(encrypted).not.toContain(plaintext);
  });

  it('produces a different ciphertext each call (random IV per encryption)', () => {
    const plaintext = 'same input';
    const a = encryptField(plaintext, key);
    const b = encryptField(plaintext, key);
    expect(a).not.toBe(b);
  });

  it('throws (fails closed) when decrypting with the wrong key', () => {
    const encrypted = encryptField('secret', key);
    const wrongKey = randomBytes(32);
    expect(() => decryptField(encrypted, wrongKey)).toThrow();
  });

  it('throws when the ciphertext has been tampered with (GCM auth-tag mismatch)', () => {
    const encrypted = encryptField('secret', key);
    const parts = encrypted.split(':');
    // Flip the last character of the ciphertext segment.
    const tampered = [
      parts[0],
      parts[1],
      `${parts[2]?.slice(0, -1)}${parts[2]?.slice(-1) === 'A' ? 'B' : 'A'}`,
    ].join(':');
    expect(() => decryptField(tampered, key)).toThrow();
  });

  it('throws for a malformed (non-3-part) encoded value', () => {
    expect(() => decryptField('not-a-real-encoded-value', key)).toThrow(
      'Malformed encrypted field value',
    );
  });

  describe('decodeEncryptionKey', () => {
    it('decodes a valid base64-encoded 32-byte key', () => {
      const raw = randomBytes(32);
      expect(decodeEncryptionKey(raw.toString('base64'))).toEqual(raw);
    });

    it('throws for a key that does not decode to exactly 32 bytes', () => {
      expect(() => decodeEncryptionKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    });
  });
});
