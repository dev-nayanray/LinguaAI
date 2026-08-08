// Vocabulary intelligence bounded context (ARCHITECTURE.md §2.1). First
// real content (E9-T1): the admin authoring + learner-facing read wire
// contract for the curated `VocabularyItem` catalog, mirroring
// @linguaai/types/vocabulary field-for-field, matching every other bounded
// context's own established schema-plus-drift-guard pattern.

import { z } from 'zod';
import { PARTS_OF_SPEECH, type VocabularyItem } from '@linguaai/types/vocabulary';

/**
 * Compile-time-only drift guard (identical pattern to every other bounded
 * context's own `assertExtends`): fails to compile if a schema's inferred
 * shape stops matching its canonical @linguaai/types/vocabulary interface.
 * Never invoked for any runtime effect.
 */
function assertExtends<Expected, Actual extends Expected>(_witness?: Actual): void {
  // no-op — see doc comment above; `Actual` is referenced in `_witness`'s
  // type so it isn't flagged as an unused type parameter.
}

export const partOfSpeechSchema = z.enum(PARTS_OF_SPEECH);

/** One example-sentence entry within `VocabularyItem.exampleSentences` — structured, never raw HTML (vocabulary.prisma's own header comment). */
export const vocabularyExampleSentenceSchema = z.object({
  sentence: z.string().min(1),
  translation: z.string().min(1).optional(),
});
export type VocabularyExampleSentence = z.infer<typeof vocabularyExampleSentenceSchema>;

// --- Entity (response) schema ---

export const vocabularyItemSchema = z.object({
  id: z.string().uuid(),
  languageId: z.string().uuid(),
  term: z.string(),
  partOfSpeech: partOfSpeechSchema,
  translations: z.record(z.string(), z.unknown()),
  audioUrl: z.string().nullable(),
  exampleSentences: z.array(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<VocabularyItem, z.infer<typeof vocabularyItemSchema>>();
export type VocabularyItemResponse = z.infer<typeof vocabularyItemSchema>;

// --- Admin authoring request schemas (E9-T1, §6.1) ---

export const createVocabularyItemRequestSchema = z.object({
  languageId: z.string().uuid(),
  term: z.string().min(1),
  partOfSpeech: partOfSpeechSchema,
  /** Keyed by UI-language code, e.g. `{"en": "hello", "fr": "bonjour"}` — at least one translation required, an item with none would be unusable. */
  translations: z.record(z.string(), z.string().min(1)).refine((t) => Object.keys(t).length > 0, {
    message: 'translations must include at least one entry',
  }),
  audioUrl: z.string().url().optional(),
  exampleSentences: z.array(vocabularyExampleSentenceSchema).optional(),
});
export type CreateVocabularyItemRequest = z.infer<typeof createVocabularyItemRequestSchema>;

export const updateVocabularyItemRequestSchema = z.object({
  term: z.string().min(1).optional(),
  partOfSpeech: partOfSpeechSchema.optional(),
  translations: z
    .record(z.string(), z.string().min(1))
    .refine((t) => Object.keys(t).length > 0, {
      message: 'translations must include at least one entry',
    })
    .optional(),
  audioUrl: z.string().url().nullable().optional(),
  exampleSentences: z.array(vocabularyExampleSentenceSchema).nullable().optional(),
});
export type UpdateVocabularyItemRequest = z.infer<typeof updateVocabularyItemRequestSchema>;

// --- Catalog read contract (E9-T1, §6.1) ---

/** `GET /v1/vocabulary-items` query params — offset-paginated (API_GUIDELINES.md §4's own named "bounded, rarely-changing admin list" case, the same classification `Course`/`Language` catalogs already use). `search` is a case-insensitive substring match on `term`. */
export const vocabularyItemListQuerySchema = z.object({
  languageId: z.string().uuid().optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type VocabularyItemListQuery = z.infer<typeof vocabularyItemListQuerySchema>;

export const vocabularyItemListResponseSchema = z.object({
  data: z.array(vocabularyItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
export type VocabularyItemListResponse = z.infer<typeof vocabularyItemListResponseSchema>;
