import { Injectable } from '@nestjs/common';
import {
  writingCorrectionResultSchema,
  type CorrectWritingRequest,
  type WritingCorrectionResult,
} from '@linguaai/validation/ai-coaching';

import { RouterService } from '../gateway/router.service.js';
import { renderTemplate } from '../prompts/render-template.js';
import { formatGroundingContextForPrompt } from '../rag/format-grounding-context.js';
import { RagRetrievalService } from '../rag/rag-retrieval.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { parseJsonTolerantOfMarkdownFence } from '../shared/parse-json-tolerant-of-markdown-fence.util.js';
import { writingCorrectionPromptTemplate } from './writing-correction.prompt.js';

/**
 * `services/ai-engine/src/writing-coaching/` (E13 T1, design doc §6.1,
 * ADR-052). Deliberately not routed through `OrchestratorService`/
 * `AIAgentSession` — a one-shot, structured-output task with no session,
 * memory, or multi-turn concept, the same shape `AssessmentScoringService`
 * already established for Writing-skill placement scoring. This is
 * `RagRetrievalService`'s (E5 T7) first real consumer — its own doc
 * comment names Grammar Coach (this service) and Exam Coach (E19) as its
 * intended first callers, deliberately left unwired until now.
 */
@Injectable()
export class WritingCoachService {
  constructor(
    private readonly router: RouterService,
    private readonly ragRetrieval: RagRetrievalService,
    private readonly safetyLayer: SafetyLayerService,
  ) {}

  async correctWriting(input: CorrectWritingRequest): Promise<WritingCorrectionResult> {
    const grounding = await this.ragRetrieval.retrieveGroundingContext({
      queryText: input.text,
      languageId: input.languageId,
      category: 'GRAMMAR_REFERENCE',
    });

    const systemPrompt =
      renderTemplate(writingCorrectionPromptTemplate.template, {
        targetLanguageName: input.targetLanguageName,
      }) + formatGroundingContextForPrompt(grounding);

    // The learner's own writing is untrusted input (mirrors
    // AssessmentScoringService's own treatment of a learner's essay) —
    // delimited before it ever reaches the model.
    const delimitedText = this.safetyLayer.delimitUntrustedContent('learner_writing', input.text);

    const response = await this.router.generate('writing', {
      systemPrompt,
      messages: [{ role: 'user', content: delimitedText }],
      temperature: 0,
    });

    const result = this.parseAndValidate(response.content);

    return {
      ...result,
      overallFeedback: this.safetyLayer.sanitizeOutput(result.overallFeedback),
      corrections: result.corrections.map((c) => ({
        ...c,
        explanation: this.safetyLayer.sanitizeOutput(c.explanation),
      })),
    };
  }

  /**
   * A malformed or schema-violating model response is a thrown error,
   * never silently passed through as if valid — the same "reproducible
   * scoring" bar `AssessmentScoringService`/`FluencyScoringService` already
   * established. Fence-tolerant JSON parsing reuses the shared utility
   * `ContentDraftingService`/`FluencyScoringService` already extracted,
   * rather than a fourth inline duplicate.
   */
  private parseAndValidate(rawContent: string): WritingCorrectionResult {
    const parsedJson = parseJsonTolerantOfMarkdownFence(rawContent, 'WritingCoachService');

    const result = writingCorrectionResultSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `WritingCoachService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }
}
