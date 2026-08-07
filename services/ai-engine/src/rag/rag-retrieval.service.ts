import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type KnowledgeBaseCategory, type PrismaClient } from '@linguaai/database';

import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { RouterService } from '../gateway/router.service.js';
import { estimateTokens, toVectorLiteral } from '../shared/vector-search.util.js';
import { citationFor } from './format-grounding-context.js';
import {
  RAG_RETRIEVAL_CANDIDATE_POOL_SIZE,
  RAG_RETRIEVAL_TOKEN_BUDGET,
} from './rag-retrieval.constants.js';
import type { GroundingPassage, RetrieveGroundingContextInput } from './rag-retrieval.types.js';

interface KnowledgeBaseCandidateRow {
  id: string;
  category: KnowledgeBaseCategory;
  title: string;
  content: string;
  /** pgvector cosine *distance* (`<=>`) — 0 is identical, 2 is maximally dissimilar; NOT a similarity score. */
  distance: number;
}

/**
 * AI_SYSTEM.md §4's "RAG Retrieval Layer" (ADR-008): grounding passages
 * for any agent response making a factual or scoring claim. Distinct from
 * `MemoryManagerService` (T6) — same pgvector infrastructure, a wholly
 * separate collection (`KnowledgeBaseEntry`, never merged with
 * `AIMemoryEntry`), and a different ranking model: curated content is
 * governed by `isActive`/linguist sign-off, not automatic confidence
 * decay, so this service ranks by similarity alone.
 *
 * Deliberately not wired into `OrchestratorService` (unlike Memory
 * Manager) — ADR-008 names this "a blocking dependency for Grammar Coach
 * and Exam Coach shipping" (E13/E19), i.e. each specialist's own real
 * pedagogical logic is the actual consumer, not every general
 * conversational turn. Injecting grounding context into every Orchestrator
 * turn regardless of relevance would be a bigger, unjustified design leap
 * than Memory Manager's broadly-relevant personalization context. This
 * task builds the real, tested, standalone mechanism; wiring it into a
 * real specialist response is each consuming epic's own scope, per E5 §1.
 */
@Injectable()
export class RagRetrievalService {
  constructor(
    @Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly router: RouterService,
  ) {}

  async retrieveGroundingContext(
    input: RetrieveGroundingContextInput,
  ): Promise<GroundingPassage[]> {
    const embedded = await this.router.embed({ input: input.queryText });
    const vectorLiteral = toVectorLiteral(embedded.embedding);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`"isActive" = true`,
      Prisma.sql`embedding IS NOT NULL`,
    ];
    if (input.languageId) {
      conditions.push(
        Prisma.sql`("languageId" IS NULL OR "languageId" = ${input.languageId}::uuid)`,
      );
    }
    if (input.category) {
      conditions.push(Prisma.sql`category = ${input.category}::"KnowledgeBaseCategory"`);
    }

    const candidates = await this.prisma.$queryRaw<KnowledgeBaseCandidateRow[]>(Prisma.sql`
      SELECT id, category, title, content,
             (embedding <=> ${vectorLiteral}::vector) AS distance
      FROM "KnowledgeBaseEntry"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY distance ASC
      LIMIT ${RAG_RETRIEVAL_CANDIDATE_POOL_SIZE}
    `);

    const result: GroundingPassage[] = [];
    let usedTokens = 0;
    for (const candidate of candidates) {
      const tokens = estimateTokens(candidate.content);
      if (result.length > 0 && usedTokens + tokens > RAG_RETRIEVAL_TOKEN_BUDGET) {
        break;
      }
      result.push({
        id: candidate.id,
        category: candidate.category,
        title: candidate.title,
        content: candidate.content,
        citation: citationFor(candidate.id),
      });
      usedTokens += tokens;
    }

    return result;
  }
}
