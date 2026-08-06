import { decryptField, encryptField } from '@linguaai/utils';
import type { PrismaClient } from '@prisma/client';

import { getDataKeyProvider } from './get-data-key-provider.js';

const AI_MESSAGE_CONTENT_PURPOSE = 'ai_message_content';
/** Envelope encryption's standard caching pattern (ADR-029's own named
 * consequence): cache the decrypted data key for a short TTL, never the
 * KMS master key itself — bounds the blast radius of a compromised
 * process to this window, while avoiding a KMS round trip per message. */
const DATA_KEY_CACHE_TTL_MS = 15 * 60 * 1000;

interface CachedKey {
  plaintextKey: Buffer;
  cachedAt: number;
}

let activeKeyId: string | undefined;
const keyCache = new Map<string, CachedKey>();

function isFresh(cached: CachedKey): boolean {
  return Date.now() - cached.cachedAt < DATA_KEY_CACHE_TTL_MS;
}

/** Test-only: clears the in-memory data-key cache. */
export function _resetAiMessageCipherCacheForTesting(): void {
  activeKeyId = undefined;
  keyCache.clear();
}

async function getOrCreateActiveDataKey(
  prisma: PrismaClient,
): Promise<{ id: string; plaintextKey: Buffer }> {
  if (activeKeyId) {
    const cached = keyCache.get(activeKeyId);
    if (cached && isFresh(cached)) {
      return { id: activeKeyId, plaintextKey: cached.plaintextKey };
    }
  }

  const provider = getDataKeyProvider();
  const existing = await prisma.encryptionDataKey.findFirst({
    where: { purpose: AI_MESSAGE_CONTENT_PURPOSE, retiredAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    const plaintextKey = await provider.decryptDataKey(existing.wrappedKey);
    activeKeyId = existing.id;
    keyCache.set(existing.id, { plaintextKey, cachedAt: Date.now() });
    return { id: existing.id, plaintextKey };
  }

  const generated = await provider.generateDataKey();
  const created = await prisma.encryptionDataKey.create({
    data: {
      purpose: AI_MESSAGE_CONTENT_PURPOSE,
      wrappedKey: generated.wrappedKey,
      kmsKeyId: generated.kmsKeyId,
      provider: provider.name,
    },
  });
  activeKeyId = created.id;
  keyCache.set(created.id, { plaintextKey: generated.plaintextKey, cachedAt: Date.now() });
  return { id: created.id, plaintextKey: generated.plaintextKey };
}

async function getDataKeyById(prisma: PrismaClient, id: string): Promise<Buffer> {
  const cached = keyCache.get(id);
  if (cached && isFresh(cached)) {
    return cached.plaintextKey;
  }

  const row = await prisma.encryptionDataKey.findUniqueOrThrow({ where: { id } });
  const provider = getDataKeyProvider();
  const plaintextKey = await provider.decryptDataKey(row.wrappedKey);
  keyCache.set(id, { plaintextKey, cachedAt: Date.now() });
  return plaintextKey;
}

/** Returns `<dataKeyId>:<iv>:<authTag>:<ciphertext>` — self-contained, decryptable without external state beyond the referenced EncryptionDataKey row. */
export async function encryptAiMessageContent(
  plaintext: string,
  prisma: PrismaClient,
): Promise<string> {
  const { id, plaintextKey } = await getOrCreateActiveDataKey(prisma);
  return `${id}:${encryptField(plaintext, plaintextKey)}`;
}

/** Throws if the stored value is malformed or its referenced data key can't be resolved — never returns a silently-wrong plaintext. */
export async function decryptAiMessageContent(
  stored: string,
  prisma: PrismaClient,
): Promise<string> {
  const separatorIndex = stored.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error('Malformed encrypted AIMessage.content value: missing data key id');
  }
  const dataKeyId = stored.slice(0, separatorIndex);
  const encoded = stored.slice(separatorIndex + 1);
  const plaintextKey = await getDataKeyById(prisma, dataKeyId);
  return decryptField(encoded, plaintextKey);
}
