import { NotFoundException } from '@nestjs/common';
import type { VocabularyItemResponse } from '@linguaai/validation/vocabulary';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { SrsDeckService } from './srs-deck.service.js';
import type { VocabularyCatalogService } from './vocabulary-catalog.service.js';

const CALLER: RequestUser = {
  userId: 'user-1',
  role: 'USER',
  organizationId: null,
  orgRole: null,
};

function makeRow(
  overrides: Partial<{
    id: string;
    userId: string;
    easeFactor: number;
    intervalDays: number;
    repetitions: number;
    nextReviewAt: Date;
    lastReviewedAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'entry-1',
    userId: overrides.userId ?? 'user-1',
    vocabularyItemId: 'item-1',
    easeFactor: overrides.easeFactor ?? 2.5,
    intervalDays: overrides.intervalDays ?? 0,
    repetitions: overrides.repetitions ?? 0,
    nextReviewAt: overrides.nextReviewAt ?? new Date('2026-01-01T00:00:00.000Z'),
    lastReviewedAt: overrides.lastReviewedAt ?? null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function fakePrisma() {
  return {
    userVocabulary: {
      upsert: jest.fn().mockResolvedValue(makeRow()),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(makeRow()),
    },
  };
}

function fakeVocabularyCatalog(): jest.Mocked<Pick<VocabularyCatalogService, 'getById'>> {
  return { getById: jest.fn() };
}

describe('SrsDeckService', () => {
  describe('addToDeck', () => {
    it('validates the vocabularyItemId against the real catalog before upserting', async () => {
      const prisma = fakePrisma();
      const vocabularyCatalog = fakeVocabularyCatalog();
      vocabularyCatalog.getById.mockResolvedValue({} as VocabularyItemResponse);
      const service = new SrsDeckService(
        prisma as never,
        vocabularyCatalog as unknown as VocabularyCatalogService,
      );

      await service.addToDeck(CALLER, { vocabularyItemId: 'item-1' });

      expect(vocabularyCatalog.getById).toHaveBeenCalledWith('item-1');
      expect(prisma.userVocabulary.upsert).toHaveBeenCalledWith({
        where: { userId_vocabularyItemId: { userId: 'user-1', vocabularyItemId: 'item-1' } },
        create: { userId: 'user-1', vocabularyItemId: 'item-1' },
        update: {},
      });
    });

    it('propagates a 404 for an invalid vocabularyItemId, without upserting anything', async () => {
      const prisma = fakePrisma();
      const vocabularyCatalog = fakeVocabularyCatalog();
      vocabularyCatalog.getById.mockRejectedValue(
        new NotFoundException('Vocabulary item not found'),
      );
      const service = new SrsDeckService(
        prisma as never,
        vocabularyCatalog as unknown as VocabularyCatalogService,
      );

      await expect(service.addToDeck(CALLER, { vocabularyItemId: 'missing' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userVocabulary.upsert).not.toHaveBeenCalled();
    });
  });

  describe('listDue', () => {
    it('filters to the caller and nextReviewAt <= now, ordered oldest-due-first', async () => {
      const prisma = fakePrisma();
      const service = new SrsDeckService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await service.listDue(CALLER, { limit: 20 });

      expect(prisma.userVocabulary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', nextReviewAt: { lte: expect.any(Date) } },
          orderBy: [{ nextReviewAt: 'asc' }, { id: 'asc' }],
          take: 21,
        }),
      );
    });

    it('returns a real nextCursor when more rows exist than the page limit', async () => {
      const prisma = fakePrisma();
      prisma.userVocabulary.findMany.mockResolvedValue([
        makeRow({ id: 'entry-1' }),
        makeRow({ id: 'entry-2' }),
      ]);
      const service = new SrsDeckService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      const result = await service.listDue(CALLER, { limit: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBe('entry-1');
    });
  });

  describe('submitReview', () => {
    it('applies the SM-2 transition and persists easeFactor/intervalDays/repetitions/nextReviewAt/lastReviewedAt', async () => {
      const prisma = fakePrisma();
      prisma.userVocabulary.findUnique.mockResolvedValue(
        makeRow({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }),
      );
      const service = new SrsDeckService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await service.submitReview(CALLER, 'entry-1', 4);

      expect(prisma.userVocabulary.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: {
          easeFactor: expect.any(Number),
          intervalDays: 1,
          repetitions: 1,
          nextReviewAt: expect.any(Date),
          lastReviewedAt: expect.any(Date),
        },
      });
    });

    it('sets nextReviewAt to roughly intervalDays from now', async () => {
      const prisma = fakePrisma();
      prisma.userVocabulary.findUnique.mockResolvedValue(
        makeRow({ easeFactor: 2.6, intervalDays: 6, repetitions: 2 }),
      );
      const service = new SrsDeckService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      const before = Date.now();
      await service.submitReview(CALLER, 'entry-1', 4);

      const call = prisma.userVocabulary.update.mock.calls[0]![0] as {
        data: { nextReviewAt: Date; intervalDays: number };
      };
      const expectedMs = before + call.data.intervalDays * 24 * 60 * 60 * 1000;
      expect(Math.abs(call.data.nextReviewAt.getTime() - expectedMs)).toBeLessThan(5000);
    });

    it('throws 404 when the entry does not exist', async () => {
      const prisma = fakePrisma();
      prisma.userVocabulary.findUnique.mockResolvedValue(null);
      const service = new SrsDeckService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await expect(service.submitReview(CALLER, 'missing', 4)).rejects.toThrow(NotFoundException);
      expect(prisma.userVocabulary.update).not.toHaveBeenCalled();
    });

    it('throws 404 (not 403) when the entry belongs to a different user, never leaking its existence', async () => {
      const prisma = fakePrisma();
      prisma.userVocabulary.findUnique.mockResolvedValue(makeRow({ userId: 'user-2' }));
      const service = new SrsDeckService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await expect(service.submitReview(CALLER, 'entry-1', 4)).rejects.toThrow(NotFoundException);
      expect(prisma.userVocabulary.update).not.toHaveBeenCalled();
    });
  });
});
