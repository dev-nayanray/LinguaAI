import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms';

import type { DataKeyProvider, GeneratedDataKey } from './data-key-provider.js';

/**
 * Real AWS KMS envelope encryption (ADR-029). Generates a 256-bit AES data
 * key via KMS's own `GenerateDataKey` (returns both the plaintext key and
 * its KMS-wrapped `CiphertextBlob` in one call — the standard envelope
 * pattern, avoiding a second round trip), and unwraps a previously stored
 * `CiphertextBlob` via `Decrypt`. The KMS key itself (its policy, rotation
 * schedule) is provisioned by infrastructure/Terraform, out of this
 * class's scope — it only calls the key by ID.
 */
export class AwsKmsDataKeyProvider implements DataKeyProvider {
  readonly name = 'AWS_KMS' as const;

  private readonly client: KMSClient;
  private readonly keyId: string;

  constructor(keyId: string, client: KMSClient = new KMSClient({})) {
    if (!keyId) {
      throw new Error('AwsKmsDataKeyProvider requires a KMS key ID (AI_MESSAGE_KMS_KEY_ID)');
    }
    this.keyId = keyId;
    this.client = client;
  }

  async generateDataKey(): Promise<GeneratedDataKey> {
    const result = await this.client.send(
      new GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' }),
    );
    if (!result.Plaintext || !result.CiphertextBlob) {
      throw new Error('AWS KMS GenerateDataKey returned no key material');
    }
    return {
      plaintextKey: Buffer.from(result.Plaintext),
      wrappedKey: Buffer.from(result.CiphertextBlob).toString('base64'),
      kmsKeyId: this.keyId,
    };
  }

  async decryptDataKey(wrappedKey: string): Promise<Buffer> {
    const result = await this.client.send(
      new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: Buffer.from(wrappedKey, 'base64'),
      }),
    );
    if (!result.Plaintext) {
      throw new Error('AWS KMS Decrypt returned no key material');
    }
    return Buffer.from(result.Plaintext);
  }
}
