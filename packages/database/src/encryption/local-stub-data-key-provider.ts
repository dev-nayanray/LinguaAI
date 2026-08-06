import { randomBytes } from 'node:crypto';

import { decodeEncryptionKey, decryptField, encryptField } from '@linguaai/utils';

import type { DataKeyProvider, GeneratedDataKey } from './data-key-provider.js';

/**
 * Stand-in for AWS KMS in local dev/CI, where no AWS credentials exist
 * (the same constraint E4 T1 hit). "Wraps" a generated data key by
 * encrypting it under a local master key, using the exact same
 * `@linguaai/utils` AES-256-GCM primitive already shipped and audited for
 * `User.mfaSecret` (E2-T13) — not a separate, unreviewed crypto path.
 *
 * Never selected when `NODE_ENV=production` — see `getDataKeyProvider`.
 */
export class LocalStubDataKeyProvider implements DataKeyProvider {
  readonly name = 'LOCAL_STUB' as const;

  private readonly masterKey: Buffer;

  constructor(masterKeyBase64: string) {
    this.masterKey = decodeEncryptionKey(masterKeyBase64);
  }

  async generateDataKey(): Promise<GeneratedDataKey> {
    const plaintextKey = randomBytes(32);
    const wrappedKey = encryptField(plaintextKey.toString('base64'), this.masterKey);
    return Promise.resolve({ plaintextKey, wrappedKey, kmsKeyId: null });
  }

  async decryptDataKey(wrappedKey: string): Promise<Buffer> {
    const decoded = decryptField(wrappedKey, this.masterKey);
    return Promise.resolve(Buffer.from(decoded, 'base64'));
  }
}
