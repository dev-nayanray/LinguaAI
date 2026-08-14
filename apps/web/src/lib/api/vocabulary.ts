import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePersonalDictionaryEntryRequest,
  PersonalDictionaryEntryResponse,
  PersonalDictionaryListResponse,
  VocabularyItemListResponse,
} from '@linguaai/validation/vocabulary';

import { authClient } from '@/lib/auth-client';

/**
 * `GET /v1/vocabulary-items` (E9 T1) — the curated catalog, searchable by
 * term. This is the only real source of a valid `languageId` this page has
 * access to (no `/v1/languages` catalog endpoint exists on this branch —
 * see docs/WEB_DESIGN.md) — every save action below reuses a catalog
 * item's own `languageId`, never a user-typed or invented one.
 */
export function fetchVocabularyCatalog(search?: string): Promise<VocabularyItemListResponse> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return authClient.request<VocabularyItemListResponse>(`/v1/vocabulary-items${query}`);
}

export function useVocabularyCatalog(search: string) {
  return useQuery({
    queryKey: ['vocabulary-items', search],
    queryFn: () => fetchVocabularyCatalog(search || undefined),
  });
}

/** `GET /v1/vocabulary/personal-dictionary` (E9 T2) — the caller's own saved terms. */
export function fetchPersonalDictionary(): Promise<PersonalDictionaryListResponse> {
  return authClient.request<PersonalDictionaryListResponse>('/v1/vocabulary/personal-dictionary');
}

export function usePersonalDictionary() {
  return useQuery({
    queryKey: ['personal-dictionary'],
    queryFn: fetchPersonalDictionary,
  });
}

/** `POST /v1/vocabulary/personal-dictionary` (E9 T2). */
export function createPersonalDictionaryEntry(
  dto: CreatePersonalDictionaryEntryRequest,
): Promise<PersonalDictionaryEntryResponse> {
  return authClient.request<PersonalDictionaryEntryResponse>('/v1/vocabulary/personal-dictionary', {
    method: 'POST',
    body: dto,
  });
}

export function useCreatePersonalDictionaryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPersonalDictionaryEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personal-dictionary'] });
    },
  });
}

/** `DELETE /v1/vocabulary/personal-dictionary/:id` (E9 T2). */
export function deletePersonalDictionaryEntry(id: string): Promise<void> {
  return authClient.request<void>(`/v1/vocabulary/personal-dictionary/${id}`, {
    method: 'DELETE',
  });
}

export function useDeletePersonalDictionaryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePersonalDictionaryEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personal-dictionary'] });
    },
  });
}
