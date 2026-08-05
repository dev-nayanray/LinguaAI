import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

/**
 * Application-layer field-level encryption (SECURITY.md §4) — for columns
 * the design doc marks "field-level encrypted at rest" (e.g.
 * `User.mfaSecret`, Part 5), where Postgres-level encryption (disk/TDE)
 * alone isn't enough: the requirement is that the plaintext never reaches
 * the database at all. AES-256-GCM: authenticated encryption, so a
 * tampered ciphertext fails to decrypt rather than silently producing
 * garbage.
 *
 * The key is a raw 32-byte value, base64-encoded for storage in an env
 * var (`MFA_SECRET_ENCRYPTION_KEY`) — generate one with
 * `openssl rand -base64 32`.
 */
export function decodeEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `Encryption key must decode to exactly ${KEY_LENGTH_BYTES} bytes, got ${key.length}`,
    );
  }
  return key;
}

/** Returns `<iv>:<authTag>:<ciphertext>`, each base64url-encoded — self-contained, no separate storage needed for the IV/tag. */
export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64url')).join(':');
}

/** Throws if the ciphertext was tampered with (GCM auth-tag mismatch) or is malformed — never returns a silently-wrong plaintext. */
export function decryptField(encoded: string, key: Buffer): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted field value');
  }
  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(authTagPart, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart, 'base64url');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
