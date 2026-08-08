import type { VocabularyItemResponse } from '@linguaai/validation/vocabulary';

import { VocabularyCatalogAdminController } from './vocabulary-catalog-admin.controller.js';
import type { VocabularyCatalogService } from './vocabulary-catalog.service.js';

const ITEM: VocabularyItemResponse = {
  id: 'item-1',
  languageId: 'lang-1',
  term: 'hola',
  partOfSpeech: 'INTERJECTION',
  translations: { en: 'hello' },
  audioUrl: null,
  exampleSentences: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function fakeService(): jest.Mocked<VocabularyCatalogService> {
  return {
    create: jest.fn().mockResolvedValue(ITEM),
    update: jest.fn().mockResolvedValue(ITEM),
    delete: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn(),
    list: jest.fn(),
  } as unknown as jest.Mocked<VocabularyCatalogService>;
}

describe('VocabularyCatalogAdminController', () => {
  it('create delegates to VocabularyCatalogService.create', async () => {
    const service = fakeService();
    const controller = new VocabularyCatalogAdminController(service);

    const dto = {
      languageId: 'lang-1',
      term: 'hola',
      partOfSpeech: 'INTERJECTION' as const,
      translations: { en: 'hello' },
    };
    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toBe(ITEM);
  });

  it('update delegates to VocabularyCatalogService.update', async () => {
    const service = fakeService();
    const controller = new VocabularyCatalogAdminController(service);

    const dto = { term: 'adios' };
    const result = await controller.update('item-1', dto);

    expect(service.update).toHaveBeenCalledWith('item-1', dto);
    expect(result).toBe(ITEM);
  });

  it('delete delegates to VocabularyCatalogService.delete', async () => {
    const service = fakeService();
    const controller = new VocabularyCatalogAdminController(service);

    await controller.delete('item-1');

    expect(service.delete).toHaveBeenCalledWith('item-1');
  });
});
