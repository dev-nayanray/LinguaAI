import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { LocalStubDataKeyProvider } from './local-stub-data-key-provider.js';

const masterKeyBase64 = randomBytes(32).toString('base64');

describe('LocalStubDataKeyProvider', () => {
  it('reports its own name as LOCAL_STUB', () => {
    const provider = new LocalStubDataKeyProvider(masterKeyBase64);
    expect(provider.name).toBe('LOCAL_STUB');
  });

  it('generates a real 32-byte plaintext data key, wrapped under the master key', async () => {
    const provider = new LocalStubDataKeyProvider(masterKeyBase64);

    const generated = await provider.generateDataKey();

    expect(generated.plaintextKey).toBeInstanceOf(Buffer);
    expect(generated.plaintextKey.length).toBe(32);
    expect(generated.kmsKeyId).toBeNull();
    // The wrapped form is never the raw base64 of the plaintext key.
    expect(generated.wrappedKey).not.toBe(generated.plaintextKey.toString('base64'));
  });

  it('round-trips: decryptDataKey recovers exactly the plaintext key generateDataKey produced', async () => {
    const provider = new LocalStubDataKeyProvider(masterKeyBase64);

    const generated = await provider.generateDataKey();
    const recovered = await provider.decryptDataKey(generated.wrappedKey);

    expect(recovered.equals(generated.plaintextKey)).toBe(true);
  });

  it('produces a different wrapped key on every call — the data key itself is randomly generated, not deterministic', async () => {
    const provider = new LocalStubDataKeyProvider(masterKeyBase64);

    const first = await provider.generateDataKey();
    const second = await provider.generateDataKey();

    expect(first.wrappedKey).not.toBe(second.wrappedKey);
    expect(first.plaintextKey.equals(second.plaintextKey)).toBe(false);
  });

  it('cannot decrypt a wrapped key using a different master key — proves the master key is actually load-bearing, not decorative', async () => {
    const providerA = new LocalStubDataKeyProvider(masterKeyBase64);
    const providerB = new LocalStubDataKeyProvider(randomBytes(32).toString('base64'));

    const generated = await providerA.generateDataKey();

    await expect(providerB.decryptDataKey(generated.wrappedKey)).rejects.toThrow();
  });
});
