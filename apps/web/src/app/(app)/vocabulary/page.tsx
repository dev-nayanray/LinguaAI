'use client';

import { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Button } from '@linguaai/ui';
import { Card, CardContent } from '@linguaai/ui/cards';

import {
  useCreatePersonalDictionaryEntry,
  useDeletePersonalDictionaryEntry,
  usePersonalDictionary,
  useVocabularyCatalog,
} from '@/lib/api/vocabulary';

function firstTranslation(translations: Record<string, unknown>): string | null {
  const value = translations.en ?? Object.values(translations)[0];
  return typeof value === 'string' ? value : null;
}

export default function VocabularyPage() {
  const [search, setSearch] = useState('');
  const catalog = useVocabularyCatalog(search);
  const saved = usePersonalDictionary();
  const createEntry = useCreatePersonalDictionaryEntry();
  const deleteEntry = useDeletePersonalDictionaryEntry();

  const savedVocabularyItemIds = new Set(
    (saved.data?.data ?? []).map((entry) => entry.vocabularyItemId).filter(Boolean),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">Vocabulary</h1>
      <p className="mt-1 type-body-sm text-neutral-text">
        Search the catalog and save words to your personal dictionary.
      </p>

      <div className="relative mt-6">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-text"
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a term…"
          aria-label="Search vocabulary"
          className="w-full rounded-md border border-border bg-surface-muted py-2 pl-10 pr-3 type-body-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </div>

      <div className="mt-4 space-y-2">
        {catalog.isLoading && (
          <div className="h-16 w-full animate-pulse rounded-lg bg-surface-muted" />
        )}
        {catalog.isError && (
          <p className="type-body-sm text-neutral-text">Could not load the vocabulary catalog.</p>
        )}
        {!catalog.isLoading && !catalog.isError && catalog.data?.data.length === 0 && (
          <p className="type-body-sm text-neutral-text">No matching words found.</p>
        )}
        {catalog.data?.data.map((item) => {
          const translation = firstTranslation(item.translations);
          const alreadySaved = savedVocabularyItemIds.has(item.id);
          return (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <p className="type-body-md font-semibold text-text">{item.term}</p>
                  {translation && <p className="type-body-sm text-neutral-text">{translation}</p>}
                </div>
                <Button
                  variant={alreadySaved ? 'secondary' : 'primary'}
                  disabled={alreadySaved || createEntry.isPending}
                  onClick={() =>
                    createEntry.mutate({
                      languageId: item.languageId,
                      term: item.term,
                      translation: translation ?? undefined,
                      source: 'MANUAL',
                      vocabularyItemId: item.id,
                    })
                  }
                >
                  {alreadySaved ? 'Saved' : 'Save'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 type-heading-lg text-text">Your saved words</h2>
      <div className="mt-4 space-y-2">
        {saved.isLoading && (
          <div className="h-16 w-full animate-pulse rounded-lg bg-surface-muted" />
        )}
        {saved.isError && (
          <p className="type-body-sm text-neutral-text">Could not load your saved words.</p>
        )}
        {!saved.isLoading && !saved.isError && saved.data?.data.length === 0 && (
          <p className="type-body-sm text-neutral-text">
            You haven't saved any words yet — search above and save a few.
          </p>
        )}
        {saved.data?.data.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <div>
                <p className="type-body-md font-semibold text-text">{entry.term}</p>
                {entry.translation && (
                  <p className="type-body-sm text-neutral-text">{entry.translation}</p>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove ${entry.term} from your saved words`}
                disabled={deleteEntry.isPending}
                onClick={() => deleteEntry.mutate(entry.id)}
                className="rounded-md p-2 text-neutral-text transition-colors duration-micro hover:bg-surface-muted hover:text-danger-text"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
