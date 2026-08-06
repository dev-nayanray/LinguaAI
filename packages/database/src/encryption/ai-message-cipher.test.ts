import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetAiMessageCipherCacheForTesting,
  decryptAiMessageContent,
  encryptAiMessageContent,
} from './ai-message-cipher.js';
import { _resetDataKeyProviderForTesting } from './get-data-key-provider.js';
import type { DataKeyProvider } from './data-key-provider.js';

vi.mock('./get-data-key-provider.js', async () => {
  const actual = await vi.importActual<typeof import('./get-data-key-provider.js')>(
    './get-data-key-provider.js',
  );
  return { ...actual, getDataKeyProvider: vi.fn() };
});

import { getDataKeyProvider } from './get-data-key-provider.js';

const mockedGetDataKeyProvider = vi.mocked(getDataKeyProvider);

function fakePrisma(
  overrides: {
    findFirst?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    findUniqueOrThrow?: ReturnType<typeof vi.fn>;
  } = {},
): PrismaClient {
  return {
    encryptionDataKey: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(null),
      create: overrides.create ?? vi.fn(),
      findUniqueOrThrow: overrides.findUniqueOrThrow ?? vi.fn(),
    },
  } as unknown as PrismaClient;
}

function fakeProvider(overrides: Partial<DataKeyProvider> = {}): DataKeyProvider {
  return {
    name: 'LOCAL_STUB',
    generateDataKey: vi.fn().mockResolvedValue({
      plaintextKey: Buffer.alloc(32, 7),
      wrappedKey: 'wrapped-key-material',
      kmsKeyId: null,
    }),
    decryptDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    ...overrides,
  };
}

describe('ai-message-cipher', () => {
  beforeEach(() => {
    _resetAiMessageCipherCacheForTesting();
    _resetDataKeyProviderForTesting();
  });

  describe('encryptAiMessageContent', () => {
    it('generates a new data key and persists it when no active key row exists yet', async () => {
      const provider = fakeProvider();
      mockedGetDataKeyProvider.mockReturnValue(provider);
      const create = vi.fn().mockResolvedValue({ id: 'key-row-1' });
      const prisma = fakePrisma({ findFirst: vi.fn().mockResolvedValue(null), create });

      const result = await encryptAiMessageContent('hello world', prisma);

      expect(provider.generateDataKey).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: {
          purpose: 'ai_message_content',
          wrappedKey: 'wrapped-key-material',
          kmsKeyId: null,
          provider: 'LOCAL_STUB',
        },
      });
      expect(result.startsWith('key-row-1:')).toBe(true);
      // Format is <keyId>:<iv>:<authTag>:<ciphertext> — 4 colon-separated parts.
      expect(result.split(':')).toHaveLength(4);
    });

    it('reuses an existing active key row instead of generating a new one', async () => {
      const provider = fakeProvider();
      mockedGetDataKeyProvider.mockReturnValue(provider);
      const findFirst = vi
        .fn()
        .mockResolvedValue({ id: 'existing-key', wrappedKey: 'wrapped-key-material' });
      const prisma = fakePrisma({ findFirst });

      await encryptAiMessageContent('hello', prisma);

      expect(provider.generateDataKey).not.toHaveBeenCalled();
      expect(provider.decryptDataKey).toHaveBeenCalledWith('wrapped-key-material');
    });

    it('caches the active key across calls — a second encrypt within the TTL does not re-query the database', async () => {
      const provider = fakeProvider();
      mockedGetDataKeyProvider.mockReturnValue(provider);
      const findFirst = vi
        .fn()
        .mockResolvedValue({ id: 'existing-key', wrappedKey: 'wrapped-key-material' });
      const prisma = fakePrisma({ findFirst });

      await encryptAiMessageContent('first', prisma);
      await encryptAiMessageContent('second', prisma);

      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    it('never stores the plaintext in the returned value — the encoded content differs from the input', async () => {
      const provider = fakeProvider();
      mockedGetDataKeyProvider.mockReturnValue(provider);
      const prisma = fakePrisma({ create: vi.fn().mockResolvedValue({ id: 'key-row-1' }) });

      const result = await encryptAiMessageContent('a very secret message', prisma);

      expect(result).not.toContain('a very secret message');
    });
  });

  describe('decryptAiMessageContent', () => {
    it('round-trips: decrypting what encryptAiMessageContent produced recovers the original plaintext', async () => {
      const provider = fakeProvider();
      mockedGetDataKeyProvider.mockReturnValue(provider);
      const prisma = fakePrisma({
        create: vi.fn().mockResolvedValue({ id: 'key-row-1' }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 'key-row-1', wrappedKey: 'wrapped-key-material' }),
      });

      const encrypted = await encryptAiMessageContent('round trip me', prisma);
      const decrypted = await decryptAiMessageContent(encrypted, prisma);

      expect(decrypted).toBe('round trip me');
    });

    it('throws on a malformed value with no data-key-id separator, rather than returning garbage', async () => {
      const prisma = fakePrisma();

      await expect(decryptAiMessageContent('not-a-valid-encoded-value', prisma)).rejects.toThrow(
        'Malformed encrypted AIMessage.content value: missing data key id',
      );
    });

    it('resolves the correct historical key by id even when it is not the currently active key — supports key rotation', async () => {
      const provider = fakeProvider();
      mockedGetDataKeyProvider.mockReturnValue(provider);
      const findUniqueOrThrow = vi
        .fn()
        .mockResolvedValue({ id: 'old-retired-key', wrappedKey: 'old-wrapped' });
      const prisma = fakePrisma({ findUniqueOrThrow });

      await decryptAiMessageContent('old-retired-key:aa:bb:cc', prisma).catch(() => {
        // decryptField will fail on fake ciphertext "aa:bb:cc" — that's fine, we only assert the lookup path here.
      });

      expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'old-retired-key' } });
      expect(provider.decryptDataKey).toHaveBeenCalledWith('old-wrapped');
    });
  });
});
