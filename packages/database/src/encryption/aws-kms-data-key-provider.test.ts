import type { KMSClient } from '@aws-sdk/client-kms';
import { describe, expect, it, vi } from 'vitest';

import { AwsKmsDataKeyProvider } from './aws-kms-data-key-provider.js';

function fakeClient(send: ReturnType<typeof vi.fn>): KMSClient {
  return { send } as unknown as KMSClient;
}

describe('AwsKmsDataKeyProvider', () => {
  it('reports its own name as AWS_KMS', () => {
    const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(vi.fn()));
    expect(provider.name).toBe('AWS_KMS');
  });

  it('throws at construction time if no KMS key ID is given — fails fast rather than failing on first real use', () => {
    expect(() => new AwsKmsDataKeyProvider('', fakeClient(vi.fn()))).toThrow(
      'AwsKmsDataKeyProvider requires a KMS key ID',
    );
  });

  describe('generateDataKey', () => {
    it('returns the plaintext key, base64 wrapped ciphertext, and the KMS key id', async () => {
      const send = vi.fn().mockResolvedValue({
        Plaintext: new Uint8Array([1, 2, 3, 4]),
        CiphertextBlob: new Uint8Array([9, 9, 9]),
      });
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));

      const result = await provider.generateDataKey();

      expect(result.plaintextKey).toEqual(Buffer.from([1, 2, 3, 4]));
      expect(result.wrappedKey).toBe(Buffer.from([9, 9, 9]).toString('base64'));
      expect(result.kmsKeyId).toBe('key-123');
    });

    it('sends a GenerateDataKeyCommand with AES_256 and the configured key id', async () => {
      const send = vi
        .fn()
        .mockResolvedValue({ Plaintext: new Uint8Array([1]), CiphertextBlob: new Uint8Array([1]) });
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));

      await provider.generateDataKey();

      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0]![0];
      expect(command.input).toEqual({ KeyId: 'key-123', KeySpec: 'AES_256' });
    });

    it('throws rather than returning undefined key material if KMS omits Plaintext', async () => {
      const send = vi.fn().mockResolvedValue({ CiphertextBlob: new Uint8Array([1]) });
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));

      await expect(provider.generateDataKey()).rejects.toThrow(
        'AWS KMS GenerateDataKey returned no key material',
      );
    });

    it('throws rather than returning undefined key material if KMS omits CiphertextBlob', async () => {
      const send = vi.fn().mockResolvedValue({ Plaintext: new Uint8Array([1]) });
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));

      await expect(provider.generateDataKey()).rejects.toThrow(
        'AWS KMS GenerateDataKey returned no key material',
      );
    });
  });

  describe('decryptDataKey', () => {
    it('unwraps a base64 wrapped key back to a plaintext Buffer', async () => {
      const send = vi.fn().mockResolvedValue({ Plaintext: new Uint8Array([5, 6, 7]) });
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));

      const result = await provider.decryptDataKey(Buffer.from([9, 9]).toString('base64'));

      expect(result).toEqual(Buffer.from([5, 6, 7]));
    });

    it('sends a DecryptCommand with the configured key id and the decoded ciphertext blob', async () => {
      const send = vi.fn().mockResolvedValue({ Plaintext: new Uint8Array([1]) });
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));
      const wrapped = Buffer.from([9, 9]).toString('base64');

      await provider.decryptDataKey(wrapped);

      const command = send.mock.calls[0]![0];
      expect(command.input.KeyId).toBe('key-123');
      expect(Buffer.from(command.input.CiphertextBlob).equals(Buffer.from([9, 9]))).toBe(true);
    });

    it('throws rather than returning undefined key material if KMS omits Plaintext', async () => {
      const send = vi.fn().mockResolvedValue({});
      const provider = new AwsKmsDataKeyProvider('key-123', fakeClient(send));

      await expect(provider.decryptDataKey('AAAA')).rejects.toThrow(
        'AWS KMS Decrypt returned no key material',
      );
    });
  });
});
