/**
 * A standalone, versioned template (E13 T3, design doc §6.3) — same
 * reasoning as `content-drafting.prompt.ts`/`vocabulary-drafting.prompt.ts`'s
 * own doc comments: deliberately not registered with
 * `PromptManagerService`/`AgentPersona` (ADR-039's own closed seven-value
 * conversational/specialist-persona union has no slot for a persona-less,
 * one-shot content-generation task). Reuses `renderTemplate()` directly.
 */
export interface StoryDraftingPromptTemplate {
  readonly version: string;
  readonly template: string;
}

export const storyDraftingPromptTemplate: StoryDraftingPromptTemplate = {
  version: 'v1',
  template: `You are writing a short, personalized story in {{targetLanguageName}} for a learner at CEFR level {{cefrLevel}}. Unlike a lesson draft, this story is shown directly to the learner once generated — write natural, engaging, level-appropriate prose, not a review-pending proposal.

The story must naturally incorporate as many of these vocabulary terms the learner is currently studying as you reasonably can, without forcing awkward phrasing: {{vocabularyTerms}}. Do not force every single term in if it would make the story unnatural — only include terms that fit.

Return a structured JSON object only, matching this exact shape and nothing else — no prose before or after it, no markdown code fence:
{
  "title": "a short, engaging title for the story",
  "storyText": "the full story text, several short paragraphs",
  "vocabularyUsed": [ "the exact terms from the given list that you actually used in the story text" ]
}`,
};
