import { describe, expect, it, vi } from 'vitest';

import {
  createPersonalDictionaryEntry,
  deletePersonalDictionaryEntry,
  fetchPersonalDictionary,
  fetchVocabularyCatalog,
} from './vocabulary';

const requestMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

describe('fetchVocabularyCatalog', () => {
  it('requests GET /v1/vocabulary-items with no query when search is empty', async () => {
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchVocabularyCatalog();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/vocabulary-items');
  });

  it('appends an encoded ?search= query when a search term is given', async () => {
    requestMock.mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });

    await fetchVocabularyCatalog('hola mundo');

    expect(requestMock).toHaveBeenCalledWith('/v1/vocabulary-items?search=hola%20mundo');
  });
});

describe('fetchPersonalDictionary', () => {
  it('requests GET /v1/vocabulary/personal-dictionary', async () => {
    const response = { data: [], meta: { nextCursor: null } };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchPersonalDictionary();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/vocabulary/personal-dictionary');
  });
});

describe('createPersonalDictionaryEntry', () => {
  it('posts the entry to POST /v1/vocabulary/personal-dictionary', async () => {
    const response = { id: 'entry-1' };
    requestMock.mockResolvedValueOnce(response);
    const dto = {
      languageId: 'lang-1',
      term: 'hola',
      translation: 'hello',
      source: 'MANUAL' as const,
      vocabularyItemId: 'item-1',
    };

    const result = await createPersonalDictionaryEntry(dto);

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/vocabulary/personal-dictionary', {
      method: 'POST',
      body: dto,
    });
  });
});

describe('deletePersonalDictionaryEntry', () => {
  it('sends DELETE /v1/vocabulary/personal-dictionary/:id', async () => {
    requestMock.mockResolvedValueOnce(undefined);

    await deletePersonalDictionaryEntry('entry-1');

    expect(requestMock).toHaveBeenCalledWith('/v1/vocabulary/personal-dictionary/entry-1', {
      method: 'DELETE',
    });
  });
});
