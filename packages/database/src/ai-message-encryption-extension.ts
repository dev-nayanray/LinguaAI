import type { PrismaClient } from '@prisma/client';

import { decryptAiMessageContent, encryptAiMessageContent } from './encryption/index.js';

/** Narrows Prisma's `content` update-input shape (`string | { set: string }`) to the plain string being assigned, or undefined if `content` isn't being touched. */
function readContentUpdateValue(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (
    content &&
    typeof content === 'object' &&
    'set' in content &&
    typeof (content as { set: unknown }).set === 'string'
  ) {
    return (content as { set: string }).set;
  }
  return undefined;
}

async function decryptRow<T>(row: T, prisma: PrismaClient): Promise<T> {
  if (
    row &&
    typeof row === 'object' &&
    'content' in row &&
    typeof (row as { content: unknown }).content === 'string'
  ) {
    (row as { content: string }).content = await decryptAiMessageContent(
      (row as { content: string }).content,
      prisma,
    );
  }
  return row;
}

/**
 * Transparent field-level encryption for `AIMessage.content` (ADR-029).
 * Every consumer of the shared Prisma client gets encrypt-on-write /
 * decrypt-on-read without remembering to call anything — the guarantee
 * lives at the table's own access path, not at each caller's discretion.
 * A raw `$queryRaw`/`$executeRaw` call deliberately bypasses this (used
 * by this domain's own verification script to prove the on-disk value is
 * genuinely ciphertext, not a decrypted-read illusion).
 */
export function withAiMessageEncryption(base: PrismaClient) {
  return base.$extends({
    name: 'ai-message-field-encryption',
    query: {
      aIMessage: {
        async create({ args, query }) {
          if (typeof args.data.content === 'string') {
            args.data.content = await encryptAiMessageContent(args.data.content, base);
          }
          return decryptRow(await query(args), base);
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          for (const row of rows) {
            if (typeof row.content === 'string') {
              row.content = await encryptAiMessageContent(row.content, base);
            }
          }
          return query(args);
        },
        async update({ args, query }) {
          const plaintext = readContentUpdateValue(args.data.content);
          if (plaintext !== undefined) {
            args.data.content = await encryptAiMessageContent(plaintext, base);
          }
          return decryptRow(await query(args), base);
        },
        async upsert({ args, query }) {
          if (typeof args.create.content === 'string') {
            args.create.content = await encryptAiMessageContent(args.create.content, base);
          }
          const updatePlaintext = readContentUpdateValue(args.update.content);
          if (updatePlaintext !== undefined) {
            args.update.content = await encryptAiMessageContent(updatePlaintext, base);
          }
          return decryptRow(await query(args), base);
        },
        async findUnique({ args, query }) {
          return decryptRow(await query(args), base);
        },
        async findUniqueOrThrow({ args, query }) {
          return decryptRow(await query(args), base);
        },
        async findFirst({ args, query }) {
          return decryptRow(await query(args), base);
        },
        async findFirstOrThrow({ args, query }) {
          return decryptRow(await query(args), base);
        },
        async findMany({ args, query }) {
          const rows = await query(args);
          return Promise.all(rows.map((row) => decryptRow(row, base)));
        },
      },
    },
  });
}
