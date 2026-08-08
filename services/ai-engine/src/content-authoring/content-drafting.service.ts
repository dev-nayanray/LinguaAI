import { Injectable } from '@nestjs/common';
import {
  contentDraftLessonSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';

import { RouterService } from '../gateway/router.service.js';
import { renderTemplate } from '../prompts/render-template.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { contentDraftingPromptTemplate } from './content-drafting.prompt.js';

/**
 * `services/ai-engine/src/content-authoring/` (E8 T4, §6.4, ADR-041).
 * Deliberately not routed through `OrchestratorService`/`AIAgentSession` —
 * a one-shot, structured-output task with no session, memory, or
 * multi-turn concept, the same reasoning `AssessmentScoringService`
 * (ADR-039) already established for its own one-shot scoring task.
 * Composes `RouterService` (T1) and `SafetyLayerService` (T8) directly.
 * No `RagRetrievalService` grounding here, unlike `AssessmentScoringService`
 * — a lesson draft is creative generation an `ADMIN` will review and edit,
 * not a factual/scoring claim `AI_SYSTEM.md` §2's own RAG-grounding
 * requirement applies to.
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

    const draft = this.parseAndValidate(response.content);
    return this.sanitizeDraft(draft);
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
  private parseAndValidate(rawContent: string): ContentDraftLesson {
    const unfenced = rawContent
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(unfenced);
    } catch {
      throw new Error(
        'ContentDraftingService: model response was not valid JSON — refusing to guess a draft',
      );
    }

    const result = contentDraftLessonSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `ContentDraftingService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }

  /** Every model-generated free-text field is sanitized (AI_GOVERNANCE.md §7) before this draft is ever returned to `apps/api` — the exercise prompt/activity title/lesson description are all rendered as rich text once an ADMIN reviews the draft, the same "AI output rendered as rich content is sanitized before rendering" rule every other model-generated text in this platform already carries. */
  private sanitizeDraft(draft: ContentDraftLesson): ContentDraftLesson {
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
}
