import type { Request } from 'express';
import type {
  PersonalDictionaryEntryResponse,
  PersonalDictionaryListResponse,
} from '@linguaai/validation/vocabulary';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PersonalDictionaryController } from './personal-dictionary.controller.js';
import type { PersonalDictionaryService } from './personal-dictionary.service.js';

const CALLER: RequestUser = {
  userId: 'user-1',
  role: 'USER',
  organizationId: null,
  orgRole: null,
};

const ENTRY: PersonalDictionaryEntryResponse = {
  id: 'entry-1',
  userId: 'user-1',
  languageId: 'lang-1',
  term: 'gato',
  translation: 'cat',
  source: 'READING',
  notes: null,
  vocabularyItemId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LIST_RESPONSE: PersonalDictionaryListResponse = {
  data: [ENTRY],
  meta: { nextCursor: null },
};

function fakeReq(): Request & { user: RequestUser } {
  return { user: CALLER } as unknown as Request & { user: RequestUser };
}

function fakeService(): jest.Mocked<PersonalDictionaryService> {
  return {
    create: jest.fn().mockResolvedValue(ENTRY),
    list: jest.fn().mockResolvedValue(LIST_RESPONSE),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PersonalDictionaryService>;
}

describe('PersonalDictionaryController', () => {
  it('create delegates to PersonalDictionaryService.create with the caller', async () => {
    const service = fakeService();
    const controller = new PersonalDictionaryController(service);

    const dto = { languageId: 'lang-1', term: 'gato', source: 'READING' as const };
    const result = await controller.create(fakeReq(), dto);

    expect(service.create).toHaveBeenCalledWith(CALLER, dto);
    expect(result).toBe(ENTRY);
  });

  it('list delegates to PersonalDictionaryService.list with the caller', async () => {
    const service = fakeService();
    const controller = new PersonalDictionaryController(service);

    const query = { limit: 20 };
    const result = await controller.list(fakeReq(), query);

    expect(service.list).toHaveBeenCalledWith(CALLER, query);
    expect(result).toBe(LIST_RESPONSE);
  });

  it('delete delegates to PersonalDictionaryService.delete with the caller', async () => {
    const service = fakeService();
    const controller = new PersonalDictionaryController(service);

    await controller.delete(fakeReq(), 'entry-1');

    expect(service.delete).toHaveBeenCalledWith(CALLER, 'entry-1');
  });
});
