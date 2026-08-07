import type { PrismaClient } from '@linguaai/database';

import type { EmbedResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import { RagRetrievalService } from './rag-retrieval.service.js';
import { RAG_RETRIEVAL_TOKEN_BUDGET } from './rag-retrieval.constants.js';

function fakePrisma() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaClient & { $queryRaw: jest.Mock };
}

function fakeRouter(): jest.Mocked<Pick<RouterService, 'embed'>> {
  return { embed: jest.fn() };
}

function fakeEmbedResponse(overrides: Partial<EmbedResponse> = {}): EmbedResponse {
  return { embedding: [0.1, 0.2, 0.3], modelId: 'text-embedding-3-small', ...overrides };
}

describe('RagRetrievalService', () => {
  it('embeds the query and returns an empty array when there are no candidates', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    const result = await service.retrieveGroundingContext({ queryText: 'subjunctive mood' });

    expect(router.embed).toHaveBeenCalledWith({ input: 'subjunctive mood' });
    expect(result).toEqual([]);
  });

  it('attaches a stable kb:<id> citation to every retrieved passage', async () => {
    const prisma = fakePrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'e1',
        category: 'GRAMMAR_REFERENCE',
        title: 'Subjunctive',
        content: 'Used for doubt.',
        distance: 0.1,
      },
    ]);
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    const result = await service.retrieveGroundingContext({ queryText: 'subjunctive' });

    expect(result).toEqual([
      {
        id: 'e1',
        category: 'GRAMMAR_REFERENCE',
        title: 'Subjunctive',
        content: 'Used for doubt.',
        citation: 'kb:e1',
      },
    ]);
  });

  it('preserves pure vector-similarity order (no decay re-ranking — curated content has no decay model)', async () => {
    const prisma = fakePrisma();
    prisma.$queryRaw.mockResolvedValue([
      { id: 'closest', category: 'GRAMMAR_REFERENCE', title: 'A', content: 'a', distance: 0.05 },
      { id: 'farther', category: 'GRAMMAR_REFERENCE', title: 'B', content: 'b', distance: 0.3 },
    ]);
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    const result = await service.retrieveGroundingContext({ queryText: 'anything' });

    expect(result.map((r) => r.id)).toEqual(['closest', 'farther']);
  });

  it('stops accumulating once the token budget is spent, but always includes at least one passage', async () => {
    const prisma = fakePrisma();
    const bigContent = 'x'.repeat(RAG_RETRIEVAL_TOKEN_BUDGET * 4 + 40);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'first',
        category: 'GRAMMAR_REFERENCE',
        title: 'A',
        content: bigContent,
        distance: 0.05,
      },
      { id: 'second', category: 'GRAMMAR_REFERENCE', title: 'B', content: 'small', distance: 0.1 },
    ]);
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    const result = await service.retrieveGroundingContext({ queryText: 'anything' });

    expect(result.map((r) => r.id)).toEqual(['first']);
  });

  it('includes the isActive/embedding-not-null base filter regardless of optional inputs', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    await service.retrieveGroundingContext({ queryText: 'anything' });

    const query = prisma.$queryRaw.mock.calls[0]![0];
    expect(query.sql).toContain('"isActive" = true');
    expect(query.sql).toContain('embedding IS NOT NULL');
    expect(query.sql).not.toContain('"languageId"');
    expect(query.sql).not.toContain('category =');
  });

  it('adds a language filter (matching language-agnostic OR the given language) when languageId is supplied', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    await service.retrieveGroundingContext({ queryText: 'anything', languageId: 'lang-1' });

    const query = prisma.$queryRaw.mock.calls[0]![0];
    expect(query.sql).toContain('"languageId" IS NULL OR "languageId" =');
    expect(query.values).toContain('lang-1');
  });

  it('adds a category filter when category is supplied', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.embed.mockResolvedValue(fakeEmbedResponse());
    const service = new RagRetrievalService(prisma, router as unknown as RouterService);

    await service.retrieveGroundingContext({ queryText: 'anything', category: 'EXAM_RUBRIC' });

    const query = prisma.$queryRaw.mock.calls[0]![0];
    expect(query.sql).toContain('category =');
    expect(query.values).toContain('EXAM_RUBRIC');
  });
});
