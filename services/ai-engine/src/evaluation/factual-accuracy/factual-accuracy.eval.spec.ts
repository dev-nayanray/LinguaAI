import type { PrismaClient } from '@linguaai/database';

import { formatGroundingContextForPrompt } from '../../rag/format-grounding-context.js';
import { RagRetrievalService } from '../../rag/rag-retrieval.service.js';
import type { RouterService } from '../../gateway/router.service.js';
import { FACTUAL_ACCURACY_FIXTURES } from './factual-accuracy.fixtures.js';

function fakeRouter(): jest.Mocked<Pick<RouterService, 'embed'>> {
  return {
    embed: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], modelId: 'fixture-embed' }),
  };
}

/**
 * AI_GOVERNANCE.md §3's "Factual-accuracy set" — INTERIM version.
 *
 * What this checks: `RagRetrievalService`'s real retrieval-and-citation
 * pipeline is faithful to the curated knowledge base — for a query that
 * should match one specific fixture entry, that entry (and only that
 * entry) is returned, with the correct `kb:<id>` citation, and
 * `formatGroundingContextForPrompt()` renders it into a prompt block that
 * actually names the citation the model is instructed to use. This is a
 * real, necessary precondition for factual accuracy: if retrieval itself
 * is wrong (wrong passage, wrong/missing citation), no amount of correct
 * model behavior downstream can produce a factually-grounded, verifiable
 * answer.
 *
 * What this does NOT check, honestly out of scope for this interim
 * version: whether a real model, given correct grounding context, actually
 * produces an answer faithful to it and cites correctly — that needs a
 * live model call, unavailable in this environment (no provider API
 * credentials) and, per this repo's own established precedent throughout
 * every other test in this suite, not exercised anywhere in CI either.
 *
 * How a false negative would be caught: this suite would fail if a future
 * change to `RagRetrievalService`'s SQL/filtering/token-budget logic
 * caused it to return the wrong passage, drop the citation, or silently
 * truncate below what a real query needs — exactly the class of defect
 * `rag-retrieval.service.spec.ts`'s own synthetic-data unit tests could
 * miss if a regression only manifested against realistic curated content
 * shapes.
 *
 * Permanent, mature version: real live-model faithfulness scoring (does
 * the model's actual answer match the retrieved grounding content) is
 * owned by whichever future epic first budgets for live AI evaluation
 * infrastructure — the same interim/final-form split this directory's
 * other suites already document.
 */
describe('Factual-accuracy set (AI_GOVERNANCE.md §3, interim)', () => {
  it.each(FACTUAL_ACCURACY_FIXTURES)(
    '"$title": retrieves the correct curated entry for its own query, with the correct citation',
    async (fixture) => {
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue(
          FACTUAL_ACCURACY_FIXTURES.map((f) => ({
            id: f.id,
            category: f.category,
            title: f.title,
            content: f.content,
            distance: f.id === fixture.id ? f.distanceForOwnQuery : f.distanceForOtherQueries,
          })).sort((a, b) => a.distance - b.distance),
        ),
      } as unknown as PrismaClient;
      const router = fakeRouter();
      const service = new RagRetrievalService(prisma, router as unknown as RouterService);

      const passages = await service.retrieveGroundingContext({ queryText: fixture.query });

      expect(passages[0]?.id).toBe(fixture.id);
      expect(passages[0]?.citation).toBe(`kb:${fixture.id}`);
      expect(passages[0]?.content).toBe(fixture.content);

      const promptBlock = formatGroundingContextForPrompt(passages);
      expect(promptBlock).toContain(`[kb:${fixture.id}]`);
      expect(promptBlock).toContain(fixture.content);
    },
  );
});
