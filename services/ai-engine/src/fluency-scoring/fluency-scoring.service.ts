import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AIMessage, PrismaClient } from '@linguaai/database';
import {
  fluencyScoringModelOutputSchema,
  type ScoreFluencyResponse,
} from '@linguaai/validation/ai-coaching';

import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { RouterService } from '../gateway/router.service.js';
import { renderTemplate } from '../prompts/render-template.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { parseJsonTolerantOfMarkdownFence } from '../shared/parse-json-tolerant-of-markdown-fence.util.js';
import { fluencyScoringPromptTemplate } from './fluency-scoring.prompt.js';

function formatTranscript(messages: AIMessage[]): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join('\n');
}

/**
 * `services/ai-engine/src/fluency-scoring/` (E10 T5, design doc §6.4,
 * ADR-048). Deliberately not routed through `OrchestratorService` for the
 * scoring call itself — a one-shot, structured-output task over an
 * *already-ended* session's own history, the same reasoning
 * `AssessmentScoringService` (ADR-039) and `ContentDraftingService`
 * (ADR-041) already established for their own one-shot tasks. Unlike
 * those two, this service *does* read `ai.prisma` directly — it owns
 * `AIAgentSession`/`AIMessage`/`FluencyScore` (ADR-044), so there's no
 * caller-supplied transcript to receive; it reads its own already-
 * persisted history by `sessionId`.
 */
@Injectable()
export class FluencyScoringService {
  constructor(
    @Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly router: RouterService,
    private readonly safetyLayer: SafetyLayerService,
  ) {}

  /**
   * Idempotent: a session already scored returns its existing `FluencyScore`
   * row unchanged rather than creating a duplicate (no unique DB constraint
   * on `FluencyScore.sessionId` backs this — a deliberate, cheap
   * application-level guard, not a claim that this closes RISK_REGISTER
   * R-85's own broader "no generic Idempotency-Key infrastructure" gap).
   * `extractedVocabulary` is empty on a replay — nothing new to hand the
   * caller for a `PersonalDictionary` write it (most likely) already made
   * the first time.
   */
  async scoreSessionAndExtractVocabulary(sessionId: string): Promise<ScoreFluencyResponse> {
    const session = await this.prisma.aIAgentSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('AI agent session not found');
    }

    const existing = await this.prisma.fluencyScore.findFirst({ where: { sessionId } });
    if (existing) {
      return {
        languageId: session.languageId,
        fluencyScore: {
          overallScore: existing.overallScore,
          componentScores: fluencyScoringModelOutputSchema.shape.componentScores.parse(
            existing.componentScores,
          ),
          feedback: '',
        },
        extractedVocabulary: [],
      };
    }

    const messages = await this.prisma.aIMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
    const hasRealConversation = messages.some((message) => message.role === 'ASSISTANT');
    if (!hasRealConversation) {
      return { languageId: session.languageId, fluencyScore: null, extractedVocabulary: [] };
    }

    // The composed Prisma client (`prismaSchemaFolder`, ADR-027) reaches
    // `content.prisma`'s `Language` table too, not just `ai.*` — the same
    // "one client, whole database" shape every other cross-schema read in
    // this platform already relies on.
    const language = await this.prisma.language.findUniqueOrThrow({
      where: { id: session.languageId },
    });

    const systemPrompt = renderTemplate(fluencyScoringPromptTemplate.template, {
      targetLanguageName: language.name,
      transcript: formatTranscript(messages),
    });

    const response = await this.router.generate('fluency', {
      systemPrompt,
      messages: [{ role: 'user', content: formatTranscript(messages) }],
      temperature: 0,
    });

    const output = this.parseAndValidate(response.content);

    await this.prisma.fluencyScore.create({
      data: {
        sessionId,
        overallScore: output.overallScore,
        componentScores: output.componentScores,
      },
    });

    return {
      languageId: session.languageId,
      fluencyScore: {
        overallScore: output.overallScore,
        componentScores: output.componentScores,
        feedback: this.safetyLayer.sanitizeOutput(output.feedback),
      },
      extractedVocabulary: output.vocabulary.map((item) => ({
        term: item.term,
        translation:
          item.translation !== undefined
            ? this.safetyLayer.sanitizeOutput(item.translation)
            : undefined,
        notes: item.notes !== undefined ? this.safetyLayer.sanitizeOutput(item.notes) : undefined,
      })),
    };
  }

  /**
   * Same "reproducible scoring, never guess" discipline as
   * `AssessmentScoringService.parseAndValidate`/`ContentDraftingService`'s
   * own parsers — a malformed or schema-violating model response is a
   * thrown error.
   */
  private parseAndValidate(rawContent: string) {
    const parsedJson = parseJsonTolerantOfMarkdownFence(rawContent, 'FluencyScoringService');
    const result = fluencyScoringModelOutputSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(
        `FluencyScoringService: model response failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }
}
