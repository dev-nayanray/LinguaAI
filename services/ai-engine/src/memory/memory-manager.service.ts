import { Inject, Injectable } from '@nestjs/common';
import type { MemoryCategory, PrismaClient } from '@linguaai/database';

import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { RouterService } from '../gateway/router.service.js';
import { estimateTokens, toVectorLiteral } from '../shared/vector-search.util.js';
import {
  MEMORY_CONFIDENCE_FLOOR,
  MEMORY_RETRIEVAL_CANDIDATE_POOL_SIZE,
  MEMORY_RETRIEVAL_TOKEN_BUDGET,
  decayedConfidence,
} from './memory-retrieval.util.js';
import type {
  RetrievedMemory,
  RetrieveRelevantMemoriesInput,
  SupersedeMemoryInput,
  WriteMemoryInput,
  WriteMemoryResult,
} from './memory-manager.types.js';

interface MemoryCandidateRow {
  id: string;
  category: MemoryCategory;
  fact: string;
  confidence: number;
  lastReinforcedAt: Date;
  /** pgvector cosine *distance* (`<=>`) — 0 is identical, 2 is maximally dissimilar; NOT a similarity score. */
  distance: number;
}

/**
 * AI_SYSTEM.md §5's "Memory Manager": long-term, cross-session
 * personalization facts (distinct from T4's Orchestrator, which owns
 * short-term, in-session/rolling-summary memory only). Writes real
 * embeddings via the Router (T1/T2 — the embedding model is structurally
 * pinned there, this service never chooses one itself) and reads back via
 * a real pgvector cosine-similarity query against the HNSW index E4 T5
 * built (`embedding <=> ...::vector`).
 *
 * `Unsupported("vector(1536)")` fields are opaque to Prisma's normal
 * client API by construction (ai.prisma's own field comment) — every
 * embedding read/write here is raw SQL, not a gap specific to this
 * service.
 */
@Injectable()
export class MemoryManagerService {
  constructor(
    @Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly router: RouterService,
  ) {}

  async writeMemory(input: WriteMemoryInput): Promise<WriteMemoryResult> {
    const embedded = await this.router.embed({ input: input.fact });

    const created = await this.prisma.aIMemoryEntry.create({
      data: {
        userId: input.userId,
        languageId: input.languageId,
        category: input.category,
        fact: input.fact,
        embeddingModelVersion: embedded.modelId,
      },
    });

    await this.prisma.$executeRaw`
      UPDATE "AIMemoryEntry"
      SET embedding = ${toVectorLiteral(embedded.embedding)}::vector
      WHERE id = ${created.id}::uuid
    `;

    return { id: created.id };
  }

  /** Memory hygiene (AI_SYSTEM.md §5, T6's own schema addition): writes the corrected/consolidated fact as a new entry, then points the old entry's supersededByEntryId forward at it — the old entry is never mutated in place, preserving its own history. */
  async supersedeMemory(input: SupersedeMemoryInput): Promise<WriteMemoryResult> {
    const result = await this.writeMemory(input.newEntry);
    await this.prisma.aIMemoryEntry.update({
      where: { id: input.oldEntryId },
      data: { supersededByEntryId: result.id },
    });
    return result;
  }

  /**
   * AI_SYSTEM.md §5: "at session start, the orchestrator retrieves the
   * top-N most relevant memory entries by recency + semantic similarity,
   * bounded by a token budget." Over-fetches a candidate pool by pure
   * vector similarity, re-ranks by (similarity × decayed confidence) —
   * "recency" enters through the decay term, a stale-but-similar fact
   * ranks below a fresher one — then stops accumulating once the token
   * budget is spent. Superseded entries (`supersededByEntryId IS NOT
   * NULL`) are excluded — only the current version of a fact should ever
   * surface.
   */
  async retrieveRelevantMemories(input: RetrieveRelevantMemoriesInput): Promise<RetrievedMemory[]> {
    const embedded = await this.router.embed({ input: input.queryText });
    const vectorLiteral = toVectorLiteral(embedded.embedding);

    const candidates = await this.prisma.$queryRaw<MemoryCandidateRow[]>`
      SELECT id, category, fact, confidence, "lastReinforcedAt",
             (embedding <=> ${vectorLiteral}::vector) AS distance
      FROM "AIMemoryEntry"
      WHERE "userId" = ${input.userId}::uuid
        AND "languageId" = ${input.languageId}::uuid
        AND "supersededByEntryId" IS NULL
        AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${MEMORY_RETRIEVAL_CANDIDATE_POOL_SIZE}
    `;

    const now = new Date();
    const scored = candidates
      .map((c) => ({
        id: c.id,
        category: c.category,
        fact: c.fact,
        confidence: decayedConfidence(c.confidence, c.lastReinforcedAt, now),
        similarity: 1 - c.distance,
      }))
      .filter((c) => c.confidence >= MEMORY_CONFIDENCE_FLOOR)
      .sort((a, b) => b.similarity * b.confidence - a.similarity * a.confidence);

    const result: RetrievedMemory[] = [];
    let usedTokens = 0;
    for (const candidate of scored) {
      const tokens = estimateTokens(candidate.fact);
      if (result.length > 0 && usedTokens + tokens > MEMORY_RETRIEVAL_TOKEN_BUDGET) {
        break;
      }
      result.push({
        id: candidate.id,
        category: candidate.category,
        fact: candidate.fact,
        confidence: candidate.confidence,
      });
      usedTokens += tokens;
    }

    return result;
  }
}
