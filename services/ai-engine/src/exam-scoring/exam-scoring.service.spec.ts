import type { ScoreExamSectionRequest } from '@linguaai/validation/ai-coaching';

import type { GenerateResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import type { GroundingPassage } from '../rag/rag-retrieval.types.js';
import type { RagRetrievalService } from '../rag/rag-retrieval.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { ExamScoringService } from './exam-scoring.service.js';

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
      band: 6.5,
      feedback: 'Addresses the task with a clear position; some grammatical errors persist.',
    }),
    inputTokens: 250,
    outputTokens: 60,
    modelId: 'claude-exam-model',
    latencyMs: 900,
    ...overrides,
  };
}

const INPUT: ScoreExamSectionRequest = {
  skill: 'WRITING',
  taskPrompt: 'Describe a chart showing internet access by country.',
  learnerResponse: 'The chart shows internet access rose steadily between 2000 and 2020.',
};

describe('ExamScoringService', () => {
  function buildService(
    router: jest.Mocked<Pick<RouterService, 'generate'>>,
    ragRetrieval: jest.Mocked<Pick<RagRetrievalService, 'retrieveGroundingContext'>>,
    safetyLayer: SafetyLayerService = realSafetyLayer(),
  ): ExamScoringService {
    return new ExamScoringService(
      router as unknown as RouterService,
      ragRetrieval as unknown as RagRetrievalService,
      safetyLayer,
    );
  }

  it('retrieves grounding context filtered to EXAM_RUBRIC, no languageId', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const ragRetrieval = fakeRagRetrieval();
    const service = buildService(router, ragRetrieval);

    await service.scoreSection(INPUT);

    expect(ragRetrieval.retrieveGroundingContext).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'EXAM_RUBRIC' }),
    );
    const call = ragRetrieval.retrieveGroundingContext.mock.calls[0]![0];
    expect(call).not.toHaveProperty('languageId');
  });

  it("calls RouterService.generate with the 'exam' request class", async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    await service.scoreSection(INPUT);

    expect(router.generate).toHaveBeenCalledWith('exam', expect.any(Object));
  });

  it('delimits the learner response as untrusted content before sending it to the model', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    await service.scoreSection(INPUT);

    const call = router.generate.mock.calls[0]![1] as { messages: { content: string }[] };
    expect(call.messages[0]!.content).toContain(
      '<untrusted_context label="learner_exam_response">',
    );
    expect(call.messages[0]!.content).toContain(INPUT.learnerResponse);
  });

  it('folds retrieved grounding passages into the system prompt with their citation', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const passage: GroundingPassage = {
      id: 'kb-1',
      category: 'EXAM_RUBRIC',
      title: 'IELTS Writing Task 2 Band 7 Descriptor',
      content: 'Addresses all parts of the task with a clear position throughout.',
      citation: 'kb:kb-1',
    };
    const service = buildService(router, fakeRagRetrieval([passage]));

    await service.scoreSection(INPUT);

    const call = router.generate.mock.calls[0]![1] as { systemPrompt: string };
    expect(call.systemPrompt).toContain('[kb:kb-1]');
    expect(call.systemPrompt).toContain('Addresses all parts');
  });

  it('returns a validated band score parsed from the model response', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.scoreSection(INPUT);

    expect(result).toEqual({
      band: 6.5,
      feedback: 'Addresses the task with a clear position; some grammatical errors persist.',
    });
  });

  it('tolerates a ```json markdown-fenced response (a common real-model quirk)', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: '```json\n{"band": 7, "feedback": "Strong response."}\n```',
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.scoreSection(INPUT);

    expect(result.band).toBe(7);
  });

  it('sanitizes feedback using the real SafetyLayerService', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          band: 6,
          feedback: 'Nice work <script>alert(1)</script> overall.',
        }),
      }),
    );
    const service = buildService(router, fakeRagRetrieval());

    const result = await service.scoreSection(INPUT);

    expect(result.feedback).not.toContain('<script>');
    expect(result.feedback).toContain('Nice work');
  });

  it('throws when the model response is not valid JSON', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse({ content: 'not json at all' }));
    const service = buildService(router, fakeRagRetrieval());

    await expect(service.scoreSection(INPUT)).rejects.toThrow();
  });

  it('throws when the model response is valid JSON but fails schema validation (band out of 0.5 steps)', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({ content: JSON.stringify({ band: 6.3, feedback: 'x' }) }),
    );
    const service = buildService(router, fakeRagRetrieval());

    await expect(service.scoreSection(INPUT)).rejects.toThrow(/schema validation/);
  });
});
