import type { PrismaClient } from '@linguaai/database';

import type { EmbedResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import { MemoryManagerService } from './memory-manager.service.js';
import { MEMORY_RETRIEVAL_TOKEN_BUDGET } from './memory-retrieval.util.js';

function fakePrisma() {
  return {
    aIMemoryEntry: {
      create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaClient & {
    aIMemoryEntry: { create: jest.Mock; update: jest.Mock };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
}

function fakeRouter(): jest.Mocked<Pick<RouterService, 'embed'>> {
  return { embed: jest.fn() };
}

function fakeEmbedResponse(overrides: Partial<EmbedResponse> = {}): EmbedResponse {
  return { embedding: [0.1, 0.2, 0.3], modelId: 'text-embedding-3-small', ...overrides };
}

describe('MemoryManagerService', () => {
  describe('writeMemory', () => {
    it('embeds the fact, creates the row with the as-served model version, and writes the embedding via raw SQL', async () => {
      const prisma = fakePrisma();
      const router = fakeRouter();
      router.embed.mockResolvedValue(fakeEmbedResponse());
      const service = new MemoryManagerService(prisma, router as unknown as RouterService);

      const result = await service.writeMemory({
        userId: 'user-1',
        languageId: 'lang-1',
        category: 'MISTAKE',
        fact: 'confuses ser/estar',
      });

      expect(router.embed).toHaveBeenCalledWith({ input: 'confuses ser/estar' });
      expect(prisma.aIMemoryEntry.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          languageId: 'lang-1',
          category: 'MISTAKE',
          fact: 'confuses ser/estar',
          embeddingModelVersion: 'text-embedding-3-small',
        },
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'entry-1' });
    });
  });

  describe('supersedeMemory', () => {
    it('writes the new entry first, then points the old entry at it', async () => {
      const prisma = fakePrisma();
      const router = fakeRouter();
      router.embed.mockResolvedValue(fakeEmbedResponse());
      const service = new MemoryManagerService(prisma, router as unknown as RouterService);

      const result = await service.supersedeMemory({
        oldEntryId: 'old-entry',
        newEntry: {
          userId: 'user-1',
          languageId: 'lang-1',
          category: 'MISTAKE',
          fact: 'a corrected fact',
        },
      });

      expect(prisma.aIMemoryEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fact: 'a corrected fact' }) }),
      );
      expect(prisma.aIMemoryEntry.update).toHaveBeenCalledWith({
        where: { id: 'old-entry' },
        data: { supersededByEntryId: 'entry-1' },
      });
      expect(result).toEqual({ id: 'entry-1' });
    });
  });

  describe('retrieveRelevantMemories', () => {
    it('embeds the query and ranks candidates by similarity weighted by decayed confidence', async () => {
      const prisma = fakePrisma();
      const now = new Date();
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'low-similarity',
          category: 'MISTAKE',
          fact: 'a distant fact',
          confidence: 1.0,
          lastReinforcedAt: now,
          distance: 0.9,
        },
        {
          id: 'high-similarity',
          category: 'MISTAKE',
          fact: 'a close fact',
          confidence: 1.0,
          lastReinforcedAt: now,
          distance: 0.1,
        },
      ]);
      const router = fakeRouter();
      router.embed.mockResolvedValue(fakeEmbedResponse());
      const service = new MemoryManagerService(prisma, router as unknown as RouterService);

      const result = await service.retrieveRelevantMemories({
        userId: 'user-1',
        languageId: 'lang-1',
        queryText: 'ser vs estar',
      });

      expect(router.embed).toHaveBeenCalledWith({ input: 'ser vs estar' });
      expect(result.map((r) => r.id)).toEqual(['high-similarity', 'low-similarity']);
    });

    it('excludes a candidate whose decayed confidence has fallen below the floor', async () => {
      const prisma = fakePrisma();
      const longAgo = new Date('2000-01-01T00:00:00Z');
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'stale',
          category: 'MISTAKE',
          fact: 'an old fact',
          confidence: 1.0,
          lastReinforcedAt: longAgo,
          distance: 0.1,
        },
      ]);
      const router = fakeRouter();
      router.embed.mockResolvedValue(fakeEmbedResponse());
      const service = new MemoryManagerService(prisma, router as unknown as RouterService);

      const result = await service.retrieveRelevantMemories({
        userId: 'user-1',
        languageId: 'lang-1',
        queryText: 'anything',
      });

      expect(result).toEqual([]);
    });

    it('stops accumulating once the token budget is spent, but always includes at least one result', async () => {
      const prisma = fakePrisma();
      const now = new Date();
      const bigFact = 'x'.repeat(MEMORY_RETRIEVAL_TOKEN_BUDGET * 4 + 40);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'first',
          category: 'MISTAKE',
          fact: bigFact,
          confidence: 1.0,
          lastReinforcedAt: now,
          distance: 0.05,
        },
        {
          id: 'second',
          category: 'MISTAKE',
          fact: 'a small fact',
          confidence: 1.0,
          lastReinforcedAt: now,
          distance: 0.1,
        },
      ]);
      const router = fakeRouter();
      router.embed.mockResolvedValue(fakeEmbedResponse());
      const service = new MemoryManagerService(prisma, router as unknown as RouterService);

      const result = await service.retrieveRelevantMemories({
        userId: 'user-1',
        languageId: 'lang-1',
        queryText: 'anything',
      });

      expect(result.map((r) => r.id)).toEqual(['first']);
    });

    it('returns an empty array when there are no candidates', async () => {
      const prisma = fakePrisma();
      const router = fakeRouter();
      router.embed.mockResolvedValue(fakeEmbedResponse());
      const service = new MemoryManagerService(prisma, router as unknown as RouterService);

      const result = await service.retrieveRelevantMemories({
        userId: 'user-1',
        languageId: 'lang-1',
        queryText: 'anything',
      });

      expect(result).toEqual([]);
    });
  });
});
