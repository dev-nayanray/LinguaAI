import type { CorrectWritingRequest } from '@linguaai/validation/ai-coaching';

import type { GenerateResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import type { GroundingPassage } from '../rag/rag-retrieval.types.js';
import type { RagRetrievalService } from '../rag/rag-retrieval.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { WritingCoachService } from './writing-coaching.service.js';

function fakeRouter(): jest.Mocked<Pick<RouterService, 'generate'>> {
  return { generate: jest.fn() };
}

function fakeRagRetrieval(
  passages: GroundingPassage[] = [],
): jest.Mocked<Pick<RagRetrievalService, 'retrieveGroundingContext'>> {
  return { retrieveGroundingContext: jest.fn().mockResolvedValue(passages) };
}

/** The real, dependency-free SafetyLayerService — exercises genuine delimiting/sanitization behavior, not a mock standing in for it. */
function realSafetyLayer(): SafetyLayerService {
  return new SafetyLayerService();
}

function fakeGenerateResponse(overrides: Partial<GenerateResponse> = {}): GenerateResponse {
  return {
    content: JSON.stringify({
      corrections: [
        {
          original: 'Yo tiene',
          corrected: 'Yo tengo',
          explanation: 'The verb "tener" conjugates to "tengo" for "yo", not "tiene".',
        },
      ],
      overallFeedback: 'Solid attempt overall, watch your verb conjugation.',
      cefrLevelEstimate: 'A2',
    }),
    inputTokens: 200,
    outputTokens: 60,
    modelId: 'claude-writing-model',
    latencyMs: 900,
    ...overrides,
  };
}

const INPUT: CorrectWritingRequest = {
  languageId: 'lang-es',
  targetLanguageName: 'Spanish',
  text: 'Yo tiene un perro.',
};

describe('WritingCoachService', () => {
  function buildService(
    router: jest.Mocked<Pick<RouterService, 'generate'>>,
    ragRetrieval: jest.Mocked<Pick<RagRetrievalService, 'retrieveGroundingContext'>>,
    safetyLayer: SafetyLayerService = realSafetyLayer(),
  ): WritingCoachService {
    return new WritingCoachService(
      router as unknown as RouterService,
      ragRetrieval as unknown as RagRetrievalService,
      safetyLayer,
    );
  }

  it('retrieves grounding context filtered to GRAMMAR_REFERENCE and the input language', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const ragRetrieval = fakeRagRetrieval();
    const service = buildService(router, ragRetrieval);

    await service.correctWriting(INPUT);

    expect(ragRetrieval.retrieveGroundingContext).toHaveBeenCalledWith(
      expect.objectContaining({
        queryText: INPUT.text,
        languageId: 'lang-es',
        category: 'GRAMMAR_REFERENCE',
      }),
    );
  });

  it("calls RouterService.generate with the 'writing' request class", async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    await service.correctWriting(INPUT);

    expect(router.generate).toHaveBeenCalledWith('writing', expect.any(Object));
  });

  it('delimits the learner writing as untrusted content before sending it to the model', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    await service.correctWriting(INPUT);

    const call = router.generate.mock.calls[0]![1] as { messages: { content: string }[] };
    expect(call.messages[0]!.content).toContain('<untrusted_context label="learner_writing">');
    expect(call.messages[0]!.content).toContain(INPUT.text);
  });

  it('folds retrieved grounding passages into the system prompt with their citation', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const passage: GroundingPassage = {
      id: 'kb-1',
      category: 'GRAMMAR_REFERENCE',
      title: 'Present tense of tener',
      content: '"tener" conjugates irregularly: yo tengo, tú tienes, él/ella tiene.',
      citation: 'kb:kb-1',
    };
    const service = buildService(router, fakeRagRetrieval([passage]));

    await service.correctWriting(INPUT);

    const call = router.generate.mock.calls[0]![1] as { systemPrompt: string };
    expect(call.systemPrompt).toContain('[kb:kb-1]');
    expect(call.systemPrompt).toContain('yo tengo');
  });

  it('returns a validated correction result parsed from the model response', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.correctWriting(INPUT);

    expect(result).toEqual({
      corrections: [
        {
          original: 'Yo tiene',
          corrected: 'Yo tengo',
          explanation: 'The verb "tener" conjugates to "tengo" for "yo", not "tiene".',
        },
      ],
      overallFeedback: 'Solid attempt overall, watch your verb conjugation.',
      cefrLevelEstimate: 'A2',
    });
  });

  it('preserves an optional ruleReference citation on a correction', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          corrections: [
            {
              original: 'Yo tiene',
              corrected: 'Yo tengo',
              explanation: 'Irregular conjugation.',
              ruleReference: 'kb:kb-1',
            },
          ],
          overallFeedback: 'Good effort.',
          cefrLevelEstimate: 'A2',
        }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.correctWriting(INPUT);

    expect(result.corrections[0]!.ruleReference).toBe('kb:kb-1');
  });

  it('tolerates a ```json markdown-fenced response (a common real-model quirk)', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content:
          '```json\n{"corrections": [], "overallFeedback": "Great job!", "cefrLevelEstimate": "B1"}\n```',
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.correctWriting(INPUT);

    expect(result.cefrLevelEstimate).toBe('B1');
  });

  it('sanitizes overallFeedback and every correction explanation using the real SafetyLayerService', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          corrections: [
            {
              original: 'x',
              corrected: 'y',
              explanation: 'Because <script>alert(1)</script> of grammar.',
            },
          ],
          overallFeedback: 'Nice work <script>alert(1)</script> overall.',
          cefrLevelEstimate: 'B1',
        }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.correctWriting(INPUT);

    expect(result.overallFeedback).not.toContain('<script>');
    expect(result.overallFeedback).toContain('Nice work');
    expect(result.corrections[0]!.explanation).not.toContain('<script>');
    expect(result.corrections[0]!.explanation).toContain('Because');
  });

  it('throws when the model response is not valid JSON', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse({ content: 'not json at all' }));
    const service = buildService(router, fakeRagRetrieval());

    await expect(service.correctWriting(INPUT)).rejects.toThrow(/not valid JSON/);
  });

  it('throws when the model response is valid JSON but fails schema validation', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({ corrections: 'not-an-array', overallFeedback: '' }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    await expect(service.correctWriting(INPUT)).rejects.toThrow(/schema validation/);
  });
});
