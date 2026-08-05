import { createHmac } from 'node:crypto';

/**
 * A keyed hash for a bounded, guessable input (e.g. an email address) that
 * must never be reversible or brute-forceable offline against a leaked
 * value — `identity.login.failed`'s event payload (Part 10): "an unkeyed
 * hash of a bounded, guessable input space like an email address is only
 * marginally better than storing it raw." The server-held key is what
 * makes this different from a bare `sha256(email)`, which anyone could
 * precompute a rainbow table against.
 */
export function hmacHash(value: string, base64Key: string): string {
  const key = Buffer.from(base64Key, 'base64');
  return createHmac('sha256', key).update(value.toLowerCase()).digest('hex');
}
