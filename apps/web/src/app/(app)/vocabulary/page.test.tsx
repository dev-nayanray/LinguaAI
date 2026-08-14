import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import VocabularyPage from './page';

const useVocabularyCatalogMock = vi.fn();
const usePersonalDictionaryMock = vi.fn();
const useCreatePersonalDictionaryEntryMock = vi.fn();
const useDeletePersonalDictionaryEntryMock = vi.fn();

vi.mock('@/lib/api/vocabulary', () => ({
  useVocabularyCatalog: (search: string) => useVocabularyCatalogMock(search),
  usePersonalDictionary: () => usePersonalDictionaryMock(),
  useCreatePersonalDictionaryEntry: () => useCreatePersonalDictionaryEntryMock(),
  useDeletePersonalDictionaryEntry: () => useDeletePersonalDictionaryEntryMock(),
}));

const catalogItem = {
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

const savedEntry = {
  id: 'entry-1',
  userId: 'u-1',
  languageId: 'lang-1',
  term: 'adios',
  translation: 'goodbye',
  source: 'MANUAL' as const,
  notes: null,
  vocabularyItemId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function setupDefaults() {
  useVocabularyCatalogMock.mockReturnValue({
    data: { data: [catalogItem], meta: { page: 1, pageSize: 20, total: 1 } },
    isLoading: false,
    isError: false,
  });
  usePersonalDictionaryMock.mockReturnValue({
    data: { data: [savedEntry], meta: { nextCursor: null } },
    isLoading: false,
    isError: false,
  });
  useCreatePersonalDictionaryEntryMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useDeletePersonalDictionaryEntryMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe('VocabularyPage', () => {
  it('renders real catalog results and saved words', () => {
    setupDefaults();

    render(<VocabularyPage />);

    expect(screen.getByText('hola')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('adios')).toBeInTheDocument();
    expect(screen.getByText('goodbye')).toBeInTheDocument();
  });

  it('saving a catalog word calls create with the real languageId/vocabularyItemId', async () => {
    setupDefaults();
    const mutate = vi.fn();
    useCreatePersonalDictionaryEntryMock.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    render(<VocabularyPage />);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith({
      languageId: 'lang-1',
      term: 'hola',
      translation: 'hello',
      source: 'MANUAL',
      vocabularyItemId: 'item-1',
    });
  });

  it('deleting a saved word calls delete with its id', async () => {
    setupDefaults();
    const mutate = vi.fn();
    useDeletePersonalDictionaryEntryMock.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    render(<VocabularyPage />);
    await user.click(screen.getByRole('button', { name: 'Remove adios from your saved words' }));

    expect(mutate).toHaveBeenCalledWith('entry-1');
  });

  it('shows an honest empty state when nothing has been saved yet', () => {
    setupDefaults();
    usePersonalDictionaryMock.mockReturnValue({
      data: { data: [], meta: { nextCursor: null } },
      isLoading: false,
      isError: false,
    });

    render(<VocabularyPage />);

    expect(screen.getByText(/haven't saved any words yet/)).toBeInTheDocument();
  });
});
