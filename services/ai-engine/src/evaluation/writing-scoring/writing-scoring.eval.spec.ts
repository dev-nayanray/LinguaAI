import type { GenerateResponse } from '../../gateway/model-provider.interface.js';
import type { RouterService } from '../../gateway/router.service.js';
import type { GroundingPassage } from '../../rag/rag-retrieval.types.js';
import type { RagRetrievalService } from '../../rag/rag-retrieval.service.js';
import { AssessmentScoringService } from '../../assessment-scoring/assessment-scoring.service.js';
import { SafetyLayerService } from '../../safety/safety-layer.service.js';
import { WRITING_SCORING_CASES } from './writing-scoring.fixtures.js';

function fakeRouter(critique: {
  cefrLevel: string;
  confidence: number;
  feedback: string;
}): jest.Mocked<Pick<RouterService, 'generate'>> {
  const response: GenerateResponse = {
    content: JSON.stringify(critique),
    inputTokens: 200,
    outputTokens: 60,
    modelId: 'writing-golden-set-fixture-model',
    latencyMs: 1,
  };
  return { generate: jest.fn().mockResolvedValue(response) };
}

function fakeRagRetrieval(
  passage: Pick<GroundingPassage, 'id' | 'title' | 'content'>,
): jest.Mocked<Pick<RagRetrievalService, 'retrieveGroundingContext'>> {
  return {
    retrieveGroundingContext: jest.fn().mockResolvedValue([
      {
        id: passage.id,
        category: 'CEFR_DESCRIPTOR',
        title: passage.title,
        content: passage.content,
        citation: `kb:${passage.id}`,
      },
    ]),
  };
}

/**
 * AI_GOVERNANCE.md §3's "Golden-set regression" suite, applied to
 * Writing-skill AI scoring (E6 T8) — INTERIM version, the same "later epic
 * owns the final form" precedent every suite in this directory already
 * carries.
 *
 * What this checks: the real, deterministic pipeline
 * `AssessmentScoringService.scoreWritingResponse()` composes (T4) —
 * `RagRetrievalService`'s real grounding-context folding
 * (`formatGroundingContextForPrompt`), `SafetyLayerService`'s real
 * untrusted-content delimiting of the learner's own essay and output
 * sanitization of the returned feedback, and `parseAndValidate`'s real
 * JSON-parse-and-schema-validate step — stays correct across 5 fixture
 * essays spanning every CEFR band (A1-C2) and 4 different target languages,
 * with a mocked `RouterService` (no live model call, RISK_REGISTER R-88).
 * Distinctly from `assessment-scoring.service.spec.ts`'s own component-level
 * unit tests (which each exercise one hand-picked scenario in isolation),
 * this suite's own value is breadth-across-a-realistic-corpus plus a
 * cross-fixture-contamination check: a language/passage/critique leaking
 * from one fixture into another's own result would fail loudly here even
 * though every single-fixture assertion in isolation might still pass.
 *
 * What this does NOT check, honestly out of scope for this interim
 * version: whether a real model, given one of these essays, actually
 * produces the `expectedBand` this fixture set documents — the mocked
 * Router is *configured* to return each fixture's own expected critique,
 * not asked to derive it. Real scoring-quality evaluation (does the model
 * agree with a human rater on these same 5 essays) needs a live model call,
 * unavailable in this environment and, per this directory's own established
 * precedent, not exercised anywhere in CI either.
 *
 * How a false negative would be caught: a change to
 * `AssessmentScoringService` that swapped which grounding passage/critique
 * gets threaded to which request (e.g. a shared-mutable-state bug, or an
 * accidental hardcoded language/passage) would surface as one fixture's
 * result containing another fixture's own content — exactly the class of
 * defect a single-scenario unit test running one fixture at a time
 * structurally cannot catch, since there is only ever one fixture in scope
 * to leak from.
 *
 * Permanent, mature version: real live-model scoring-quality evaluation
 * (agreement rate against human-rated CEFR bands on a held-out essay set)
 * is owned by whichever future epic first budgets for live AI evaluation
 * infrastructure — the same interim/final-form split this directory's
 * other three suites already document.
 */
describe('Golden-set regression: Writing-skill AI scoring (AI_GOVERNANCE.md §3, interim)', () => {
  it.each(WRITING_SCORING_CASES)(
    '"$title": grounds, delimits, scores, and sanitizes without cross-fixture contamination',
    async (fixture) => {
      const router = fakeRouter({
        cefrLevel: fixture.expectedBand,
        confidence: fixture.expectedConfidence,
        feedback: fixture.expectedFeedbackPhrase,
      });
      const ragRetrieval = fakeRagRetrieval(fixture.groundingPassage);
      const service = new AssessmentScoringService(
        router as unknown as RouterService,
        ragRetrieval as unknown as RagRetrievalService,
        new SafetyLayerService(),
      );

      const result = await service.scoreWritingResponse({
        languageId: fixture.languageId,
        targetLanguageName: fixture.targetLanguageName,
        prompt: fixture.prompt,
        learnerResponse: fixture.learnerResponse,
      });

      // Grounding retrieval was scoped to this fixture's own language —
      // never another fixture's (a hardcoded/leaked `languageId` would
      // surface as every fixture querying the same language).
      expect(ragRetrieval.retrieveGroundingContext).toHaveBeenCalledWith(
        expect.objectContaining({
          languageId: fixture.languageId,
          category: 'CEFR_DESCRIPTOR',
        }),
      );

      const request = router.generate.mock.calls[0]![1] as {
        systemPrompt: string;
        messages: { content: string }[];
      };

      // Real grounding-context folding — this fixture's own passage/citation, not another's.
      expect(request.systemPrompt).toContain(`[kb:${fixture.groundingPassage.id}]`);
      expect(request.systemPrompt).toContain(fixture.groundingPassage.content);

      // Real untrusted-content delimiting of this fixture's own essay.
      expect(request.messages[0]!.content).toContain(
        '<untrusted_context label="learner_writing_response">',
      );
      expect(request.messages[0]!.content).toContain(fixture.learnerResponse);

      // No cross-fixture contamination: no other fixture's own grounding
      // citation, passage content, or essay text appears in this request.
      const otherFixtures = WRITING_SCORING_CASES.filter((c) => c.id !== fixture.id);
      for (const other of otherFixtures) {
        expect(request.systemPrompt).not.toContain(`[kb:${other.groundingPassage.id}]`);
        expect(request.systemPrompt).not.toContain(other.groundingPassage.content);
        expect(request.messages[0]!.content).not.toContain(other.learnerResponse);
      }

      // The mocked critique threaded all the way through parseAndValidate
      // and sanitizeOutput unchanged — proving the pipeline's own plumbing
      // is correct, not that the score itself is accurate (see this
      // suite's own header).
      expect(result.cefrLevel).toBe(fixture.expectedBand);
      expect(result.confidence).toBe(fixture.expectedConfidence);
      expect(result.feedback).toContain(fixture.expectedFeedbackPhrase);
    },
  );
});
