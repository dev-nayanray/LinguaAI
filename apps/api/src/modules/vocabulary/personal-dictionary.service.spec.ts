import { NotFoundException } from '@nestjs/common';
import type { VocabularyItemResponse } from '@linguaai/validation/vocabulary';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PersonalDictionaryService } from './personal-dictionary.service.js';
import type { VocabularyCatalogService } from './vocabulary-catalog.service.js';

const CALLER: RequestUser = {
  userId: 'user-1',
  role: 'USER',
  organizationId: null,
  orgRole: null,
};

function makeRow(overrides: Partial<{ id: string; userId: string; createdAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'entry-1',
    userId: overrides.userId ?? 'user-1',
    languageId: 'lang-1',
    term: 'gato',
    translation: 'cat',
    source: 'READING',
    notes: null,
    vocabularyItemId: null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function fakePrisma() {
  return {
    personalDictionary: {
      create: jest.fn().mockResolvedValue(makeRow()),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function fakeVocabularyCatalog(): jest.Mocked<Pick<VocabularyCatalogService, 'getById'>> {
  return { getById: jest.fn() };
}

describe('PersonalDictionaryService', () => {
  describe('create', () => {
    it('creates an entry scoped to the caller, with no vocabularyItemId link', async () => {
      const prisma = fakePrisma();
      const vocabularyCatalog = fakeVocabularyCatalog();
      const service = new PersonalDictionaryService(
        prisma as never,
        vocabularyCatalog as unknown as VocabularyCatalogService,
      );

      await service.create(CALLER, {
        languageId: 'lang-1',
        term: 'gato',
        translation: 'cat',
        source: 'READING',
      });

      expect(prisma.personalDictionary.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          languageId: 'lang-1',
          term: 'gato',
          translation: 'cat',
          source: 'READING',
          notes: undefined,
          vocabularyItemId: undefined,
        },
      });
      expect(vocabularyCatalog.getById).not.toHaveBeenCalled();
    });

    it('validates a supplied vocabularyItemId against the real catalog before creating', async () => {
      const prisma = fakePrisma();
      const vocabularyCatalog = fakeVocabularyCatalog();
      vocabularyCatalog.getById.mockResolvedValue({} as VocabularyItemResponse);
      const service = new PersonalDictionaryService(
        prisma as never,
        vocabularyCatalog as unknown as VocabularyCatalogService,
      );

      await service.create(CALLER, {
        languageId: 'lang-1',
        term: 'gato',
        source: 'MANUAL',
        vocabularyItemId: 'item-1',
      });

      expect(vocabularyCatalog.getById).toHaveBeenCalledWith('item-1');
      expect(prisma.personalDictionary.create).toHaveBeenCalled();
    });

    it('propagates a 404 when the supplied vocabularyItemId does not reference a real catalog item, without creating anything', async () => {
      const prisma = fakePrisma();
      const vocabularyCatalog = fakeVocabularyCatalog();
      vocabularyCatalog.getById.mockRejectedValue(
        new NotFoundException('Vocabulary item not found'),
      );
      const service = new PersonalDictionaryService(
        prisma as never,
        vocabularyCatalog as unknown as VocabularyCatalogService,
      );

      await expect(
        service.create(CALLER, {
          languageId: 'lang-1',
          term: 'gato',
          source: 'MANUAL',
          vocabularyItemId: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.personalDictionary.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scopes to the caller and applies an optional languageId filter', async () => {
      const prisma = fakePrisma();
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await service.list(CALLER, { languageId: 'lang-1', limit: 20 });

      expect(prisma.personalDictionary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', languageId: 'lang-1' },
          take: 21,
        }),
      );
    });

    it('does not include a cursor clause when no cursor is given', async () => {
      const prisma = fakePrisma();
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await service.list(CALLER, { limit: 20 });

      const call = prisma.personalDictionary.findMany.mock.calls[0]![0];
      expect(call.cursor).toBeUndefined();
      expect(call.skip).toBeUndefined();
    });

    it('includes a cursor clause when a cursor is given', async () => {
      const prisma = fakePrisma();
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await service.list(CALLER, { limit: 20, cursor: 'entry-5' });

      expect(prisma.personalDictionary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'entry-5' }, skip: 1 }),
      );
    });

    it('returns a real nextCursor when more rows exist than the page limit', async () => {
      const prisma = fakePrisma();
      const rows = [makeRow({ id: 'entry-1' }), makeRow({ id: 'entry-2' })];
      prisma.personalDictionary.findMany.mockResolvedValue(rows);
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      const result = await service.list(CALLER, { limit: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBe('entry-1');
    });

    it('returns a null nextCursor when no more rows exist', async () => {
      const prisma = fakePrisma();
      prisma.personalDictionary.findMany.mockResolvedValue([makeRow()]);
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      const result = await service.list(CALLER, { limit: 20 });

      expect(result.meta.nextCursor).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes an entry owned by the caller', async () => {
      const prisma = fakePrisma();
      prisma.personalDictionary.findUnique.mockResolvedValue(makeRow({ userId: 'user-1' }));
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await service.delete(CALLER, 'entry-1');

      expect(prisma.personalDictionary.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
    });

    it('throws 404 when the entry does not exist', async () => {
      const prisma = fakePrisma();
      prisma.personalDictionary.findUnique.mockResolvedValue(null);
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await expect(service.delete(CALLER, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws 404 (not 403) when the entry belongs to a different user, never leaking existence', async () => {
      const prisma = fakePrisma();
      prisma.personalDictionary.findUnique.mockResolvedValue(makeRow({ userId: 'user-2' }));
      const service = new PersonalDictionaryService(
        prisma as never,
        fakeVocabularyCatalog() as unknown as VocabularyCatalogService,
      );

      await expect(service.delete(CALLER, 'entry-1')).rejects.toThrow(NotFoundException);
      expect(prisma.personalDictionary.delete).not.toHaveBeenCalled();
    });
  });
});
