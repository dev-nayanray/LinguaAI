import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./encryption/index.js', () => ({
  encryptAiMessageContent: vi.fn(async (plaintext: string) => `ENCRYPTED(${plaintext})`),
  decryptAiMessageContent: vi.fn(async (stored: string) =>
    stored.replace(/^ENCRYPTED\((.*)\)$/, '$1'),
  ),
}));

import { decryptAiMessageContent, encryptAiMessageContent } from './encryption/index.js';
import { withAiMessageEncryption } from './ai-message-encryption-extension.js';

const mockedEncrypt = vi.mocked(encryptAiMessageContent);
const mockedDecrypt = vi.mocked(decryptAiMessageContent);

/**
 * Captures the extension config object passed to `$extends` instead of
 * exercising Prisma's real runtime — `withAiMessageEncryption`'s own code
 * (the interceptor functions) is what this test verifies; Prisma's own
 * `$extends` machinery is Prisma's concern, not this module's.
 */
function captureExtension(base: PrismaClient) {
  let captured: any;
  // Non-enumerable so it stays invisible to toHaveBeenCalledWith's structural
  // equality checks against plain object literals like `{}` in the tests below.
  Object.defineProperty(base, '$extends', {
    value: (config: any) => (captured = config),
    configurable: true,
  });
  withAiMessageEncryption(base);
  return captured.query.aIMessage;
}

describe('withAiMessageEncryption', () => {
  beforeEach(() => {
    mockedEncrypt.mockClear();
    mockedDecrypt.mockClear();
  });

  it('encrypts a plain string content on create, and decrypts the returned row', async () => {
    const base = {} as PrismaClient;
    const handlers = captureExtension(base);
    const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(hello)' });
    const args = { data: { content: 'hello' } };

    const result = await handlers.create({ args, query });

    expect(mockedEncrypt).toHaveBeenCalledWith('hello', base);
    expect(args.data.content).toBe('ENCRYPTED(hello)');
    expect(query).toHaveBeenCalledWith(args);
    expect(result.content).toBe('hello');
  });

  it('does not touch content on create when it is not a plain string (e.g. absent)', async () => {
    const handlers = captureExtension({} as PrismaClient);
    const query = vi.fn().mockResolvedValue({ id: '1' });
    const args = { data: {} };

    await handlers.create({ args, query });

    expect(mockedEncrypt).not.toHaveBeenCalled();
  });

  it('encrypts every row in a createMany call', async () => {
    const handlers = captureExtension({} as PrismaClient);
    const query = vi.fn().mockResolvedValue({ count: 2 });
    const args = { data: [{ content: 'first' }, { content: 'second' }] };

    await handlers.createMany({ args, query });

    expect(mockedEncrypt).toHaveBeenCalledTimes(2);
    expect(args.data[0]!.content).toBe('ENCRYPTED(first)');
    expect(args.data[1]!.content).toBe('ENCRYPTED(second)');
  });

  it('handles a single (non-array) createMany data value', async () => {
    const handlers = captureExtension({} as PrismaClient);
    const query = vi.fn().mockResolvedValue({ count: 1 });
    const args = { data: { content: 'solo' } };

    await handlers.createMany({ args, query });

    expect(args.data.content).toBe('ENCRYPTED(solo)');
  });

  describe('update', () => {
    it('encrypts a plain string content value', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(updated)' });
      const args = { data: { content: 'updated' } };

      await handlers.update({ args, query });

      expect(args.data.content).toBe('ENCRYPTED(updated)');
    });

    it('encrypts a Prisma { set: string } content update-input shape', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(via-set)' });
      const args = { data: { content: { set: 'via-set' } } };

      await handlers.update({ args, query });

      expect(mockedEncrypt).toHaveBeenCalledWith('via-set', {});
      expect(args.data.content).toBe('ENCRYPTED(via-set)');
    });

    it('leaves content untouched when the update does not target it', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1' });
      const args = { data: { role: 'ASSISTANT' } };

      await handlers.update({ args, query });

      expect(mockedEncrypt).not.toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    it('encrypts both the create and update sides independently', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(updated-side)' });
      const args = { create: { content: 'created-side' }, update: { content: 'updated-side' } };

      await handlers.upsert({ args, query });

      expect(args.create.content).toBe('ENCRYPTED(created-side)');
      expect(args.update.content).toBe('ENCRYPTED(updated-side)');
    });
  });

  describe('read paths', () => {
    it('findUnique decrypts the returned row', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(secret)' });

      const result = await handlers.findUnique({ args: {}, query });

      expect(result.content).toBe('secret');
    });

    it('findUnique returns null unchanged (no row found) without calling decrypt', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue(null);

      const result = await handlers.findUnique({ args: {}, query });

      expect(result).toBeNull();
      expect(mockedDecrypt).not.toHaveBeenCalled();
    });

    it('findUniqueOrThrow decrypts the returned row', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(secret)' });

      const result = await handlers.findUniqueOrThrow({ args: {}, query });

      expect(result.content).toBe('secret');
    });

    it('findFirst decrypts the returned row', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(secret)' });

      const result = await handlers.findFirst({ args: {}, query });

      expect(result.content).toBe('secret');
    });

    it('findFirstOrThrow decrypts the returned row', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue({ id: '1', content: 'ENCRYPTED(secret)' });

      const result = await handlers.findFirstOrThrow({ args: {}, query });

      expect(result.content).toBe('secret');
    });

    it('findMany decrypts every row in the result set', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue([
        { id: '1', content: 'ENCRYPTED(one)' },
        { id: '2', content: 'ENCRYPTED(two)' },
      ]);

      const result = await handlers.findMany({ args: {}, query });

      expect(result.map((r: { content: string }) => r.content)).toEqual(['one', 'two']);
    });

    it('findMany returns an empty array unchanged', async () => {
      const handlers = captureExtension({} as PrismaClient);
      const query = vi.fn().mockResolvedValue([]);

      const result = await handlers.findMany({ args: {}, query });

      expect(result).toEqual([]);
    });
  });
});
