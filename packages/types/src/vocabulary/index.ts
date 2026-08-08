// Vocabulary intelligence bounded context (ARCHITECTURE.md §2.1, DATABASE.md
// §2.4). First real content (E9-T1): the curated `VocabularyItem` catalog,
// mirroring vocabulary.prisma field-for-field (E4 T4's schema). E9-T2 adds
// `PersonalDictionary`. Timestamps are typed `string` (ISO 8601) —
// wire/domain types consumed across the API boundary, not Prisma's own
// generated `Date`-typed types (packages/database), the same convention
// @linguaai/types/content already established.

export const PARTS_OF_SPEECH = [
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'INTERJECTION',
  'PHRASE',
  'OTHER',
] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

/** `translations`/`exampleSentences` are typed `Record<string, unknown>`/`unknown[]` — shape validated at the application layer (vocabulary.prisma's own header comment), not pinned down further here, the same discipline @linguaai/types/content's `Activity.content` already established. */
export interface VocabularyItem {
  id: string;
  languageId: string;
  term: string;
  partOfSpeech: PartOfSpeech;
  /** Keyed by UI-language code, e.g. `{"en": "hello", "fr": "bonjour"}`. */
  translations: Record<string, unknown>;
  audioUrl: string | null;
  /** Array of `{sentence, translation?}` objects — structured, never raw HTML. */
  exampleSentences: unknown[] | null;
  createdAt: string;
  updatedAt: string;
}

export const VOCABULARY_SOURCES = [
  'READING',
  'CAMERA_TRANSLATION',
  'CONVERSATION',
  'MANUAL',
  'OTHER',
] as const;
export type VocabularySource = (typeof VOCABULARY_SOURCES)[number];

/**
 * A user-saved word/phrase from any module (E9-T2, §6.2). `vocabularyItemId`
 * links it to a curated `VocabularyItem` when a match exists — nullable,
 * since a camera-translation or conversation source can surface a term the
 * curated catalog has never seen (vocabulary.prisma's own header comment).
 * `term`/`translation` are always stored directly regardless, so this never
 * depends on a catalog entry existing.
 */
export interface PersonalDictionaryEntry {
  id: string;
  userId: string;
  languageId: string;
  term: string;
  translation: string | null;
  source: VocabularySource;
  notes: string | null;
  vocabularyItemId: string | null;
  createdAt: string;
  updatedAt: string;
}
