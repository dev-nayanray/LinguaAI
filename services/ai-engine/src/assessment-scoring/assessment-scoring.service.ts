import { Injectable } from '@nestjs/common';
import {
  writingCritiqueSchema,
  type ScoreWritingRequest,
  type WritingCritiqueSchema,
} from '@linguaai/validation/ai-coaching';

import { RouterService } from '../gateway/router.service.js';
import { renderTemplate } from '../prompts/render-template.js';
import { formatGroundingContextForPrompt } from '../rag/format-grounding-context.js';
import { RagRetrievalService } from '../rag/rag-retrieval.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { writingScoringPromptTemplate } from './writing-scoring.prompt.js';

/**
 * `services/ai-engine/src/assessment-scoring/` (E6 T4, ADR-039, design doc
 * §6.3). Deliberately not routed through `OrchestratorService`/
 * `AIAgentSession` — a one-shot, structured-output task with no session,
 * memory, or multi-turn concept (ADR-039's own Context). Composes three
 * already-built E5 mechanisms directly rather than reimplementing any of
 * them: `RagRetrievalService` (T7), `RouterService` (T1), `SafetyLayerService`
 * (T8).
 */
@Injectable()
export class AssessmentScoringService {
  constructor(
    private readonly router: RouterService,
    private readonly ragRetrieval: RagRetrievalService,
    private readonly safetyLayer: SafetyLayerService,
  ) {}

  async scoreWritingResponse(input: ScoreWritingRequest): Promise<WritingCritiqueSchema> {
    const grounding = await this.ragRetrieval.retrieveGroundingContext({
      queryText: `CEFR writing proficiency descriptors for ${input.targetLanguageName}`,
      languageId: input.languageId,
      category: 'CEFR_DESCRIPTOR',
    });

    const systemPrompt =
      renderTemplate(writingScoringPromptTemplate.template, {
        targetLanguageName: input.targetLanguageName,
        writingPrompt: input.prompt,
      }) + formatGroundingContextForPrompt(grounding);

    // The learner's own essay is untrusted input (ADR-039's security note) —
    // delimited before it ever reaches the model, the same discipline
    // OrchestratorService already applies to conversation summaries/memory
    // (T4/T6 of E5), extended here to its first genuinely adversarial-input
    // consumer.
    const delimitedResponse = this.safetyLayer.delimitUntrustedContent(
      'learner_writing_response',
      input.learnerResponse,
    );

    const response = await this.router.generate('assessment', {
      systemPrompt,
      messages: [{ role: 'user', content: delimitedResponse }],
      temperature: 0,
    });

    const critique = this.parseAndValidate(response.content);

    return { ...critique, feedback: this.safetyLayer.sanitizeOutput(critique.feedback) };
  }

  /**
   * A malformed or schema-violating model response is a thrown error,
   * never silently passed through as if valid (ADR-039's own "reproducible
   * scoring" bar) — matching this epic's own discipline (`AssessmentService`'s
   * scoring path never guesses a default either). Strips a wrapping
   * ```json fence (or a bare ``` fence) before parsing — a well-known,
   * common real-model quirk (wrapping JSON in markdown despite an explicit
   * "no markdown" instruction) this platform hasn't yet exercised against a
   * live model (RISK_REGISTER — no live LLM credentials in this
   * environment); tolerating the fence is a normalization of formatting,
   * not a relaxation of the "must be valid, schema-conforming JSON
   * underneath" requirement itself.
   */
  private parseAndValidate(rawContent: string): WritingCritiqueSchema {
    const unfenced = rawContent
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(unfenced);
    } catch {
      throw new Error(
        'AssessmentScoringService: model response was not valid JSON — refusing to guess a score',
      );
    }

    const result = writingCritiqueSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `AssessmentScoringService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }
}
