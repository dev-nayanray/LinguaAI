import type {
  VocabularyItemListResponse,
  VocabularyItemResponse,
} from '@linguaai/validation/vocabulary';

import { VocabularyCatalogController } from './vocabulary-catalog.controller.js';
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

const LIST_RESPONSE: VocabularyItemListResponse = {
  data: [ITEM],
  meta: { page: 1, pageSize: 20, total: 1 },
};

function fakeService(): jest.Mocked<VocabularyCatalogService> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getById: jest.fn().mockResolvedValue(ITEM),
    list: jest.fn().mockResolvedValue(LIST_RESPONSE),
  } as unknown as jest.Mocked<VocabularyCatalogService>;
}

describe('VocabularyCatalogController', () => {
  it('list delegates to VocabularyCatalogService.list', async () => {
    const service = fakeService();
    const controller = new VocabularyCatalogController(service);

    const query = { page: 1, pageSize: 20 };
    const result = await controller.list(query);

    expect(service.list).toHaveBeenCalledWith(query);
    expect(result).toBe(LIST_RESPONSE);
  });

  it('getById delegates to VocabularyCatalogService.getById', async () => {
    const service = fakeService();
    const controller = new VocabularyCatalogController(service);

    const result = await controller.getById('item-1');

    expect(service.getById).toHaveBeenCalledWith('item-1');
    expect(result).toBe(ITEM);
  });
});
