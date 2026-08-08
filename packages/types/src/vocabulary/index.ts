// Vocabulary intelligence bounded context (ARCHITECTURE.md §2.1, DATABASE.md
// §2.4). First real content (E9-T1): the curated `VocabularyItem` catalog,
// mirroring vocabulary.prisma field-for-field (E4 T4's schema). Timestamps
// are typed `string` (ISO 8601) — wire/domain types consumed across the API
// boundary, not Prisma's own generated `Date`-typed types (packages/database),
// the same convention @linguaai/types/content already established.

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
