import { Injectable } from '@nestjs/common';
import {
  storyDraftSchema,
  type DraftStoryRequest,
  type StoryDraft,
} from '@linguaai/validation/ai-coaching';
import {
  contentDraftLessonSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';
import {
  vocabularyItemDraftSchema,
  type DraftVocabularyItemRequest,
  type VocabularyItemDraft,
} from '@linguaai/validation/vocabulary';

import { RouterService } from '../gateway/router.service.js';
import { renderTemplate } from '../prompts/render-template.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { parseJsonTolerantOfMarkdownFence } from '../shared/parse-json-tolerant-of-markdown-fence.util.js';
import { contentDraftingPromptTemplate } from './content-drafting.prompt.js';
import { storyDraftingPromptTemplate } from './story-drafting.prompt.js';
import { vocabularyDraftingPromptTemplate } from './vocabulary-drafting.prompt.js';

/**
 * `services/ai-engine/src/content-authoring/` (E8 T4, §6.4, ADR-041; E9 T4
 * extends it with `draftVocabularyItem()` rather than a new service — the
 * same "'content' AiRequestClass, admin-review-gated, never auto-published"
 * shape applies identically to a vocabulary item as to a lesson, no
 * materially different cost/latency/safety profile to justify a separate
 * home, E9 design doc §3.7). Deliberately not routed through
 * `OrchestratorService`/`AIAgentSession` — a one-shot, structured-output
 * task with no session, memory, or multi-turn concept, the same reasoning
 * `AssessmentScoringService` (ADR-039) already established for its own
 * one-shot scoring task. Composes `RouterService` (T1) and
 * `SafetyLayerService` (T8) directly. No `RagRetrievalService` grounding
 * here, unlike `AssessmentScoringService` — a draft is creative generation
 * an `ADMIN` will review and edit, not a factual/scoring claim `AI_SYSTEM.md`
 * §2's own RAG-grounding requirement applies to.
 */
@Injectable()
export class ContentDraftingService {
  constructor(
    private readonly router: RouterService,
    private readonly safetyLayer: SafetyLayerService,
  ) {}

  async draftLesson(input: DraftLessonRequest): Promise<ContentDraftLesson> {
    const systemPrompt = renderTemplate(contentDraftingPromptTemplate.template, {
      targetLanguageName: input.targetLanguageName,
      cefrLevel: input.cefrLevel,
      topic: input.topic,
    });

    // The caller is always an authenticated ADMIN (apps/api's own
    // ADMIN-gated endpoint, §6.1's authorization discipline extended
    // here) — not the same untrusted-input threat model
    // `AssessmentScoringService.scoreWritingResponse` faces from an
    // anonymous learner's own essay, so no `delimitUntrustedContent` call
    // here. `sanitizeOutput` is still mandatory on every model-generated
    // free-text field below — that discipline (AI_GOVERNANCE.md §7)
    // protects against the *model* being tricked into emitting unsafe
    // markup, regardless of how trustworthy the caller's own input was.
    const response = await this.router.generate('content', {
      systemPrompt,
      messages: [{ role: 'user', content: `Draft a lesson about: ${input.topic}` }],
      temperature: 0.7,
    });

    const draft = this.parseAndValidateLessonDraft(response.content);
    return this.sanitizeLessonDraft(draft);
  }

  /** Mirrors `draftLesson()` exactly (E9 T4, §6.4) — same `'content'` request class, same no-`delimitUntrustedContent` reasoning (the caller is always an authenticated `ADMIN`, never an anonymous learner), same mandatory `sanitizeOutput` on every model-generated free-text field. */
  async draftVocabularyItem(input: DraftVocabularyItemRequest): Promise<VocabularyItemDraft> {
    const systemPrompt = renderTemplate(vocabularyDraftingPromptTemplate.template, {
      targetLanguageName: input.targetLanguageName,
      cefrLevel: input.cefrLevel,
      term: input.term,
    });

    const response = await this.router.generate('content', {
      systemPrompt,
      messages: [{ role: 'user', content: `Draft a vocabulary catalog entry for: ${input.term}` }],
      temperature: 0.7,
    });

    const draft = this.parseAndValidateVocabularyDraft(response.content);
    return this.sanitizeVocabularyDraft(draft);
  }

  /**
   * E13 T3 (design doc §6.3) — unlike `draftLesson()`/`draftVocabularyItem()`,
   * this result is shown directly to the learner once generated, never an
   * `ADMIN`-review-gated proposal (the caller, `apps/api`'s `StoryService`,
   * persists it as a real `GeneratedStory` immediately) — still the same
   * `'content'` request class (§3.2's own reasoning: a real instance of
   * `'content'`'s existing scope, not a materially different rubric).
   * `sanitizeOutput` remains mandatory regardless of the "shown directly to
   * the learner" difference — that discipline protects against the model
   * itself emitting unsafe markup, independent of any human review step.
   */
  async draftStory(input: DraftStoryRequest): Promise<StoryDraft> {
    const systemPrompt = renderTemplate(storyDraftingPromptTemplate.template, {
      targetLanguageName: input.targetLanguageName,
      cefrLevel: input.cefrLevel,
      vocabularyTerms: input.vocabularyTerms.join(', '),
    });

    const response = await this.router.generate('content', {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Write a story using these vocabulary terms: ${input.vocabularyTerms.join(', ')}`,
        },
      ],
      temperature: 0.7,
    });

    const draft = this.parseAndValidateStoryDraft(response.content);
    return this.sanitizeStoryDraft(draft);
  }

  /**
   * A malformed or schema-violating model response is a thrown error,
   * never silently passed through as a guessed draft — the same
   * "reproducible, never a silent guess" discipline every other
   * AI-output-consuming service in this platform already carries
   * (`AssessmentScoringService.parseAndValidate`'s own precedent, whose
   * doc comment this mirrors, including tolerating a ```json markdown
   * fence, a well-known real-model quirk).
   */
  private parseAndValidateLessonDraft(rawContent: string): ContentDraftLesson {
    const parsedJson = parseJsonTolerantOfMarkdownFence(rawContent, 'ContentDraftingService');

    const result = contentDraftLessonSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `ContentDraftingService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }

  /** Every model-generated free-text field is sanitized (AI_GOVERNANCE.md §7) before this draft is ever returned to `apps/api` — the exercise prompt/activity title/lesson description are all rendered as rich text once an ADMIN reviews the draft, the same "AI output rendered as rich content is sanitized before rendering" rule every other model-generated text in this platform already carries. */
  private sanitizeLessonDraft(draft: ContentDraftLesson): ContentDraftLesson {
    return {
      ...draft,
      description: this.safetyLayer.sanitizeOutput(draft.description),
      activities: draft.activities.map((activity) => ({
        ...activity,
        title: this.safetyLayer.sanitizeOutput(activity.title),
        exercises: activity.exercises.map((exercise) => ({
          ...exercise,
          prompt: this.safetyLayer.sanitizeOutput(exercise.prompt),
        })),
      })),
    };
  }

  /** Same "not valid JSON" / "fails schema validation" discipline as `parseAndValidateLessonDraft` (E9 T4). */
  private parseAndValidateVocabularyDraft(rawContent: string): VocabularyItemDraft {
    const parsedJson = parseJsonTolerantOfMarkdownFence(rawContent, 'ContentDraftingService');

    const result = vocabularyItemDraftSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `ContentDraftingService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }

  /** Every model-generated free-text field is sanitized (AI_GOVERNANCE.md §7) — `term` is admin-supplied input, never model-generated, so it is deliberately not sanitized here (it is validated/persisted as-is by the real create endpoint, §6.1, the same way it always is). */
  private sanitizeVocabularyDraft(draft: VocabularyItemDraft): VocabularyItemDraft {
    return {
      ...draft,
      translations: Object.fromEntries(
        Object.entries(draft.translations).map(([lang, value]) => [
          lang,
          this.safetyLayer.sanitizeOutput(value),
        ]),
      ),
      exampleSentences: draft.exampleSentences?.map((example) => ({
        sentence: this.safetyLayer.sanitizeOutput(example.sentence),
        translation:
          example.translation !== undefined
            ? this.safetyLayer.sanitizeOutput(example.translation)
            : undefined,
      })),
    };
  }

  /** Same "not valid JSON" / "fails schema validation" discipline as `parseAndValidateLessonDraft` (E13 T3). */
  private parseAndValidateStoryDraft(rawContent: string): StoryDraft {
    const parsedJson = parseJsonTolerantOfMarkdownFence(rawContent, 'ContentDraftingService');

    const result = storyDraftSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `ContentDraftingService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }

  /** Every model-generated free-text field is sanitized (AI_GOVERNANCE.md §7) — `title`/`storyText` are shown directly to the learner, `vocabularyUsed` is a list of the model's own already-given input terms, never freeform model prose, so it is not sanitized here. */
  private sanitizeStoryDraft(draft: StoryDraft): StoryDraft {
    return {
      ...draft,
      title: this.safetyLayer.sanitizeOutput(draft.title),
      storyText: this.safetyLayer.sanitizeOutput(draft.storyText),
    };
  }
}
