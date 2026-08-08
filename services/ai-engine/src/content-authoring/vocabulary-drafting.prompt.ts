/**
 * A standalone, versioned template (E9 T4, §6.4) — same reasoning as
 * `content-drafting.prompt.ts`'s own doc comment: deliberately not
 * registered with `PromptManagerService`/`AgentPersona` (ADR-039's own
 * closed seven-value conversational/specialist-persona union has no slot
 * for a persona-less, one-shot content-generation task). Reuses
 * `renderTemplate()` directly.
 */
export interface VocabularyDraftingPromptTemplate {
  readonly version: string;
  readonly template: string;
}

export const vocabularyDraftingPromptTemplate: VocabularyDraftingPromptTemplate = {
  version: 'v1',
  template: `You are drafting a first-draft curated vocabulary catalog entry for the {{targetLanguageName}} term "{{term}}", at CEFR level {{cefrLevel}}. This is a DRAFT for a human curriculum editor to review and edit before it is ever shown to a learner — never claim to be final, authoritative, or already published content.

Return a structured JSON object only, matching this exact shape and nothing else — no prose before or after it, no markdown code fence:
{
  "term": "{{term}}",
  "partOfSpeech": one of "NOUN"|"VERB"|"ADJECTIVE"|"ADVERB"|"PRONOUN"|"PREPOSITION"|"CONJUNCTION"|"INTERJECTION"|"PHRASE"|"OTHER",
  "translations": { at least one entry, keyed by UI-language code, e.g. {"en": "hello"} },
  "exampleSentences": [ { "sentence": "a natural example sentence using the term", "translation": "its translation" } ] (1 to 3 entries)
}

The term itself is fixed — do not change its spelling. Focus your own judgment on choosing the correct part of speech, accurate translations, and natural, level-appropriate example sentences.`,
};
