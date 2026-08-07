import type { ScoreWritingRequest } from '@linguaai/validation/ai-coaching';

import type { GenerateResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import type { GroundingPassage } from '../rag/rag-retrieval.types.js';
import type { RagRetrievalService } from '../rag/rag-retrieval.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { AssessmentScoringService } from './assessment-scoring.service.js';

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
    content: JSON.stringify({ cefrLevel: 'B1', confidence: 0.8, feedback: 'Solid B1 writing.' }),
    inputTokens: 200,
    outputTokens: 60,
    modelId: 'claude-assessment-model',
    latencyMs: 900,
    ...overrides,
  };
}

const INPUT: ScoreWritingRequest = {
  languageId: 'lang-es',
  targetLanguageName: 'Spanish',
  prompt: 'Describe your ideal vacation.',
  learnerResponse: 'Mi vacacion ideal es en la playa.',
};

describe('AssessmentScoringService', () => {
  function buildService(
    router: jest.Mocked<Pick<RouterService, 'generate'>>,
    ragRetrieval: jest.Mocked<Pick<RagRetrievalService, 'retrieveGroundingContext'>>,
    safetyLayer: SafetyLayerService = realSafetyLayer(),
  ): AssessmentScoringService {
    return new AssessmentScoringService(
      router as unknown as RouterService,
      ragRetrieval as unknown as RagRetrievalService,
      safetyLayer,
    );
  }

  it('retrieves grounding context filtered to CEFR_DESCRIPTOR and the input language', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const ragRetrieval = fakeRagRetrieval();
    const service = buildService(router, ragRetrieval);

    await service.scoreWritingResponse(INPUT);

    expect(ragRetrieval.retrieveGroundingContext).toHaveBeenCalledWith(
      expect.objectContaining({ languageId: 'lang-es', category: 'CEFR_DESCRIPTOR' }),
    );
  });

  it("calls RouterService.generate with the 'assessment' request class", async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    await service.scoreWritingResponse(INPUT);

    expect(router.generate).toHaveBeenCalledWith('assessment', expect.any(Object));
  });

  it("delimits the learner's response as untrusted content before sending it to the model", async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    await service.scoreWritingResponse(INPUT);

    const call = router.generate.mock.calls[0]![1] as { messages: { content: string }[] };
    expect(call.messages[0]!.content).toContain(
      '<untrusted_context label="learner_writing_response">',
    );
    expect(call.messages[0]!.content).toContain(INPUT.learnerResponse);
  });

  it('folds retrieved grounding passages into the system prompt with their citation', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const passage: GroundingPassage = {
      id: 'kb-1',
      category: 'CEFR_DESCRIPTOR',
      title: 'B1 Writing Descriptor',
      content: 'Can write straightforward connected text.',
      citation: 'kb:kb-1',
    };
    const service = buildService(router, fakeRagRetrieval([passage]));

    await service.scoreWritingResponse(INPUT);

    const call = router.generate.mock.calls[0]![1] as { systemPrompt: string };
    expect(call.systemPrompt).toContain('[kb:kb-1]');
    expect(call.systemPrompt).toContain('Can write straightforward connected text.');
  });

  it('returns a validated critique object parsed from the model response', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          cefrLevel: 'C1',
          confidence: 0.72,
          feedback: 'Nuanced and fluent.',
        }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.scoreWritingResponse(INPUT);

    expect(result).toEqual({ cefrLevel: 'C1', confidence: 0.72, feedback: 'Nuanced and fluent.' });
  });

  it('tolerates a ```json markdown-fenced response (a common real-model quirk)', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content:
          '```json\n{"cefrLevel": "A2", "confidence": 0.5, "feedback": "Basic but clear."}\n```',
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.scoreWritingResponse(INPUT);

    expect(result.cefrLevel).toBe('A2');
  });

  it('sanitizes the feedback field using the real SafetyLayerService before returning', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          cefrLevel: 'B2',
          confidence: 0.6,
          feedback: 'Good work <script>alert(1)</script> overall.',
        }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.scoreWritingResponse(INPUT);

    expect(result.feedback).not.toContain('<script>');
    expect(result.feedback).toContain('Good work');
  });

  it('throws when the model response is not valid JSON', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse({ content: 'not json at all' }));
    const service = buildService(router, fakeRagRetrieval());

    await expect(service.scoreWritingResponse(INPUT)).rejects.toThrow(/not valid JSON/);
  });

  it('throws when the model response is valid JSON but fails schema validation', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({ cefrLevel: 'Z9', confidence: 2, feedback: '' }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    await expect(service.scoreWritingResponse(INPUT)).rejects.toThrow(/schema validation/);
  });
});
