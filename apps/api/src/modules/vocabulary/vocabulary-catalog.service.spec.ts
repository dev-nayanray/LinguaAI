import { NotFoundException } from '@nestjs/common';

import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

const ITEM = {
  id: 'item-1',
  languageId: 'lang-1',
  term: 'hola',
  partOfSpeech: 'INTERJECTION',
  translations: { en: 'hello' },
  audioUrl: null,
  exampleSentences: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    vocabularyItem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn().mockResolvedValue(ITEM),
      update: jest.fn().mockResolvedValue(ITEM),
    },
  };
}

function buildService(prisma: ReturnType<typeof fakePrisma>): VocabularyCatalogService {
  return new VocabularyCatalogService(prisma as never);
}

describe('VocabularyCatalogService', () => {
  describe('create', () => {
    it('creates a VocabularyItem and returns its wire shape', async () => {
      const prisma = fakePrisma();
      const service = buildService(prisma);

      const result = await service.create({
        languageId: 'lang-1',
        term: 'hola',
        partOfSpeech: 'INTERJECTION',
        translations: { en: 'hello' },
      });

      expect(prisma.vocabularyItem.create).toHaveBeenCalledWith({
        data: {
          languageId: 'lang-1',
          term: 'hola',
          partOfSpeech: 'INTERJECTION',
          translations: { en: 'hello' },
          audioUrl: undefined,
          exampleSentences: undefined,
        },
      });
      expect(result).toEqual({
        id: 'item-1',
        languageId: 'lang-1',
        term: 'hola',
        partOfSpeech: 'INTERJECTION',
        translations: { en: 'hello' },
        audioUrl: null,
        exampleSentences: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('update', () => {
    it('updates a VocabularyItem after confirming it exists and is not soft-deleted', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue(ITEM);
      const service = buildService(prisma);

      await service.update('item-1', { term: 'adios' });

      expect(prisma.vocabularyItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ term: 'adios' }),
      });
    });

    it('clears exampleSentences to SQL NULL via Prisma.JsonNull, not a bare null', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue(ITEM);
      const service = buildService(prisma);

      await service.update('item-1', { exampleSentences: null });

      const call = prisma.vocabularyItem.update.mock.calls[0]![0] as {
        data: { exampleSentences: unknown };
      };
      // Prisma.JsonNull is a real sentinel object, not the JS value `null`.
      expect(call.data.exampleSentences).not.toBeNull();
      expect(call.data.exampleSentences).toBeDefined();
    });

    it('throws 404 when the item does not exist', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.update('missing', { term: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when the item is soft-deleted', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue({ ...ITEM, deletedAt: new Date() });
      const service = buildService(prisma);

      await expect(service.update('item-1', { term: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('soft-deletes by setting deletedAt', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue(ITEM);
      const service = buildService(prisma);

      await service.delete('item-1');

      expect(prisma.vocabularyItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws 404 when the item does not exist', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue(null);
      const service = buildService(prisma);

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getById', () => {
    it('returns the wire shape for an existing, non-deleted item', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue(ITEM);
      const service = buildService(prisma);

      const result = await service.getById('item-1');

      expect(result.id).toBe('item-1');
    });

    it('throws 404 for a soft-deleted item, never serving it', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findUnique.mockResolvedValue({ ...ITEM, deletedAt: new Date() });
      const service = buildService(prisma);

      await expect(service.getById('item-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('excludes soft-deleted items and applies languageId/search filters', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findMany.mockResolvedValue([ITEM]);
      prisma.vocabularyItem.count.mockResolvedValue(1);
      const service = buildService(prisma);

      const result = await service.list({
        languageId: 'lang-1',
        search: 'hol',
        page: 1,
        pageSize: 20,
      });

      expect(prisma.vocabularyItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            languageId: 'lang-1',
            term: { contains: 'hol', mode: 'insensitive' },
          },
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('applies offset pagination via skip/take', async () => {
      const prisma = fakePrisma();
      prisma.vocabularyItem.findMany.mockResolvedValue([]);
      prisma.vocabularyItem.count.mockResolvedValue(0);
      const service = buildService(prisma);

      await service.list({ page: 3, pageSize: 10 });

      expect(prisma.vocabularyItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });
});
