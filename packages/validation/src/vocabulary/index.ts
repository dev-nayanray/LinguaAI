// Vocabulary intelligence bounded context (ARCHITECTURE.md §2.1). First
// real content (E9-T1): the admin authoring + learner-facing read wire
// contract for the curated `VocabularyItem` catalog, mirroring
// @linguaai/types/vocabulary field-for-field, matching every other bounded
// context's own established schema-plus-drift-guard pattern.

import { z } from 'zod';
import {
  PARTS_OF_SPEECH,
  VOCABULARY_SOURCES,
  type PersonalDictionaryEntry,
  type UserVocabularyEntry,
  type VocabularyItem,
} from '@linguaai/types/vocabulary';

import { cefrLevelSchema } from '../learning/index.js';

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

// --- Personal dictionary (E9-T2, §6.2) ---

export const vocabularySourceSchema = z.enum(VOCABULARY_SOURCES);

export const personalDictionaryEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  languageId: z.string().uuid(),
  term: z.string(),
  translation: z.string().nullable(),
  source: vocabularySourceSchema,
  notes: z.string().nullable(),
  vocabularyItemId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<PersonalDictionaryEntry, z.infer<typeof personalDictionaryEntrySchema>>();
export type PersonalDictionaryEntryResponse = z.infer<typeof personalDictionaryEntrySchema>;

/** `POST /v1/vocabulary/personal-dictionary` — `userId` is never client-supplied, always the caller's own id (set server-side). `vocabularyItemId`, when supplied, is validated server-side to reference a real, non-deleted `VocabularyItem` (design doc §6.2) — never trusted unchecked. */
export const createPersonalDictionaryEntryRequestSchema = z.object({
  languageId: z.string().uuid(),
  term: z.string().min(1),
  translation: z.string().min(1).optional(),
  source: vocabularySourceSchema,
  notes: z.string().min(1).optional(),
  vocabularyItemId: z.string().uuid().optional(),
});
export type CreatePersonalDictionaryEntryRequest = z.infer<
  typeof createPersonalDictionaryEntryRequestSchema
>;

/** `GET /v1/vocabulary/personal-dictionary` query params — cursor-paginated (API_GUIDELINES.md §4's own "any list that changes while being paged" case, a per-user list that grows over time), reusing `auditLogQuerySchema`'s own established `{cursor, limit}` shape (`@linguaai/validation/identity`) rather than inventing a new one. */
export const personalDictionaryListQuerySchema = z.object({
  languageId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PersonalDictionaryListQuery = z.infer<typeof personalDictionaryListQuerySchema>;

export const personalDictionaryListResponseSchema = z.object({
  data: z.array(personalDictionaryEntrySchema),
  meta: z.object({ nextCursor: z.string().uuid().nullable() }),
});
export type PersonalDictionaryListResponse = z.infer<typeof personalDictionaryListResponseSchema>;

// --- SRS review engine (E9-T3, §6.3, ADR-042) ---

export const userVocabularyEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  vocabularyItemId: z.string().uuid(),
  easeFactor: z.number(),
  intervalDays: z.number().int(),
  repetitions: z.number().int(),
  nextReviewAt: z.string().datetime(),
  lastReviewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<UserVocabularyEntry, z.infer<typeof userVocabularyEntrySchema>>();
export type UserVocabularyEntryResponse = z.infer<typeof userVocabularyEntrySchema>;

/** `POST /v1/vocabulary/deck` — adds a real, non-deleted `VocabularyItem` to the caller's own SRS deck (validated the same way `CreatePersonalDictionaryEntryRequest.vocabularyItemId` is, §6.2); idempotent on an already-added item (§6.3's own design). */
export const addToDeckRequestSchema = z.object({
  vocabularyItemId: z.string().uuid(),
});
export type AddToDeckRequest = z.infer<typeof addToDeckRequestSchema>;

/** `GET /v1/vocabulary/deck/due` query params — cursor-paginated, the same `{cursor, limit}` shape §6.2's personal-dictionary list already established; no `languageId` filter at MVP (§10's own deliberately-undesigned scope). */
export const dueDeckListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type DueDeckListQuery = z.infer<typeof dueDeckListQuerySchema>;

export const dueDeckListResponseSchema = z.object({
  data: z.array(userVocabularyEntrySchema),
  meta: z.object({ nextCursor: z.string().uuid().nullable() }),
});
export type DueDeckListResponse = z.infer<typeof dueDeckListResponseSchema>;

/** `POST /v1/vocabulary/deck/:id/reviews` — `quality` is the literal SM-2 input scale (0-5); mapping a friendlier button set onto this range is a UI concern, out of this backend epic's own scope (§3.5). */
export const submitDeckReviewRequestSchema = z.object({
  quality: z.number().int().min(0).max(5),
});
export type SubmitDeckReviewRequest = z.infer<typeof submitDeckReviewRequestSchema>;

// --- AI-assisted vocabulary-item drafting (E9 T4, §6.4) — shared between apps/api's admin endpoint and services/ai-engine's own ContentDraftingService/Controller ---

/** `POST /v1/admin/vocabulary-items/ai-draft` request body — the admin supplies the term and target-language context; the AI proposes `partOfSpeech`/`translations`/`exampleSentences`. Not attached to any real DB row yet — an admin submits the (possibly-edited) draft through T1's own real create endpoint (§6.1) to actually persist it. */
export const draftVocabularyItemRequestSchema = z.object({
  languageId: z.string().uuid(),
  targetLanguageName: z.string().min(1),
  cefrLevel: cefrLevelSchema,
  term: z.string().min(1).max(200),
});
export type DraftVocabularyItemRequest = z.infer<typeof draftVocabularyItemRequestSchema>;

/**
 * `ContentDraftingService.draftVocabularyItem()`'s own return shape (E8 T4's
 * `ContentDraftingService`, extended here rather than a new service, §6.4)
 * — deliberately identical in shape to `createVocabularyItemRequestSchema`
 * (§6.1), since the whole point of a *reviewable* draft is that once an
 * `ADMIN` approves it unedited, it can be submitted through the real create
 * endpoint verbatim. No `id`/timestamps, since nothing has been created yet.
 */
export const vocabularyItemDraftSchema = z.object({
  term: z.string().min(1),
  partOfSpeech: partOfSpeechSchema,
  translations: z.record(z.string(), z.string().min(1)).refine((t) => Object.keys(t).length > 0, {
    message: 'translations must include at least one entry',
  }),
  exampleSentences: z.array(vocabularyExampleSentenceSchema).min(1).max(3).optional(),
});
export type VocabularyItemDraft = z.infer<typeof vocabularyItemDraftSchema>;
