/**
 * A standalone, versioned template — same reasoning as
 * `writing-scoring.prompt.ts`'s own doc comment: deliberately not
 * registered with `PromptManagerService`/`AgentPersona` (ADR-039's own
 * closed seven-value conversational/specialist-persona union has no slot
 * for a persona-less, one-shot content-generation task). Reuses
 * `renderTemplate()` directly.
 */
export interface ContentDraftingPromptTemplate {
  readonly version: string;
  readonly template: string;
}

export const contentDraftingPromptTemplate: ContentDraftingPromptTemplate = {
  version: 'v1',
  template: `You are drafting a first-draft language lesson for {{targetLanguageName}} at CEFR level {{cefrLevel}}, on the topic: "{{topic}}". This is a DRAFT for a human curriculum editor to review and edit before it is ever shown to a learner — never claim to be final, authoritative, or already published content.

Return a structured JSON object only, matching this exact shape and nothing else — no prose before or after it, no markdown code fence:
{
  "title": "a short lesson title",
  "description": "a one-sentence description of what the lesson teaches",
  "estimatedMinutes": a realistic integer number of minutes to complete this lesson,
  "activities": [
    {
      "type": one of "VOCABULARY_DRILL"|"GRAMMAR_EXPLANATION"|"LISTENING"|"SPEAKING"|"READING"|"WRITING"|"CONVERSATION",
      "title": "a short activity title",
      "content": { free-form structured content appropriate to the activity type, EXCEPT for these two, which must match this exact shape: LISTENING -> {"script": "the full spoken-aloud script text, to be synthesized into audio later"}; READING -> {"passage": "the full reading passage text"} },
      "exercises": [
        {
          "type": one of "MULTIPLE_CHOICE"|"FILL_BLANK"|"MATCHING"|"TRANSLATION"|"LISTENING_COMPREHENSION",
          "prompt": "the exercise's own prompt text",
          "correctAnswer": shaped per type — {"correctIndex": <int>} for MULTIPLE_CHOICE/LISTENING_COMPREHENSION, {"acceptable": ["...", "..."]} for FILL_BLANK/TRANSLATION, {"pairs": [{"left": "...", "right": "..."}]} for MATCHING
        }
      ]
    }
  ]
}

Generate exactly one activity, with 3 to 5 exercises. Never generate a "SPEAKING_PROMPT" exercise type — this platform cannot score it yet, so it must not appear in a draft that will otherwise look ready to use.`,
};
