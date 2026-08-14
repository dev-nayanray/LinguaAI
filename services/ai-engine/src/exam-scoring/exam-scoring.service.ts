import { Injectable } from '@nestjs/common';
import {
  examSectionScoreSchema,
  type ExamSectionScore,
  type ScoreExamSectionRequest,
} from '@linguaai/validation/ai-coaching';

import { RouterService } from '../gateway/router.service.js';
import { renderTemplate } from '../prompts/render-template.js';
import { formatGroundingContextForPrompt } from '../rag/format-grounding-context.js';
import { RagRetrievalService } from '../rag/rag-retrieval.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { parseJsonTolerantOfMarkdownFence } from '../shared/parse-json-tolerant-of-markdown-fence.util.js';
import { examBandScoringPromptTemplate } from './exam-band-scoring.prompt.js';

/**
 * `services/ai-engine/src/exam-scoring/` (E19 T2, design doc §6.2,
 * ADR-058). Deliberately not routed through `OrchestratorService`/
 * `AIAgentSession` — a one-shot, structured-output task with no session,
 * memory, or multi-turn concept, the same shape `AssessmentScoringService`/
 * `WritingCoachService` already established. `RagRetrievalService`'s own
 * doc comment names this service ("Exam Coach") as its second real
 * consumer, deliberately left unwired until now.
 */
@Injectable()
export class ExamScoringService {
  constructor(
    private readonly router: RouterService,
    private readonly ragRetrieval: RagRetrievalService,
    private readonly safetyLayer: SafetyLayerService,
  ) {}

  async scoreSection(input: ScoreExamSectionRequest): Promise<ExamSectionScore> {
    const grounding = await this.ragRetrieval.retrieveGroundingContext({
      queryText: `IELTS ${input.skill} band descriptors`,
      category: 'EXAM_RUBRIC',
    });

    const systemPrompt =
      renderTemplate(examBandScoringPromptTemplate.template, {
        skill: input.skill,
        taskPrompt: input.taskPrompt,
      }) + formatGroundingContextForPrompt(grounding);

    // The learner's own response is untrusted input (mirrors
    // AssessmentScoringService's/WritingCoachService's own treatment of a
    // learner's submission) — delimited before it ever reaches the model.
    const delimitedResponse = this.safetyLayer.delimitUntrustedContent(
      'learner_exam_response',
      input.learnerResponse,
    );

    const response = await this.router.generate('exam', {
      systemPrompt,
      messages: [{ role: 'user', content: delimitedResponse }],
      temperature: 0,
    });

    const result = this.parseAndValidate(response.content);

    return { ...result, feedback: this.safetyLayer.sanitizeOutput(result.feedback) };
  }

  /**
   * A malformed or schema-violating model response is a thrown error,
   * never silently passed through as if valid — the same "reproducible
   * scoring" bar `AssessmentScoringService`/`FluencyScoringService`/
   * `WritingCoachService` already established.
   */
  private parseAndValidate(rawContent: string): ExamSectionScore {
    const parsedJson = parseJsonTolerantOfMarkdownFence(rawContent, 'ExamScoringService');

    const result = examSectionScoreSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `ExamScoringService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }
}
