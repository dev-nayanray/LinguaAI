import type { DraftLessonRequest } from '@linguaai/validation/content';
import type { DraftVocabularyItemRequest } from '@linguaai/validation/vocabulary';

import type { GenerateResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { ContentDraftingService } from './content-drafting.service.js';

function fakeRouter(): jest.Mocked<Pick<RouterService, 'generate'>> {
  return { generate: jest.fn() };
}

/** The real, dependency-free SafetyLayerService — exercises genuine sanitization behavior, not a mock standing in for it (matching AssessmentScoringService's own spec precedent). */
function realSafetyLayer(): SafetyLayerService {
  return new SafetyLayerService();
}

const VALID_DRAFT = {
  title: 'Ordering Food',
  description: 'Learn key phrases for ordering food at a restaurant.',
  estimatedMinutes: 10,
  activities: [
    {
      type: 'READING',
      title: 'At the Restaurant',
      content: { passage: 'Quisiera una mesa para dos, por favor.' },
      exercises: [
        {
          type: 'MULTIPLE_CHOICE',
          prompt: 'What does "una mesa para dos" mean?',
          correctAnswer: { correctIndex: 0 },
        },
        {
          type: 'FILL_BLANK',
          prompt: 'Quisiera ___ mesa para dos.',
          correctAnswer: { acceptable: ['una'] },
        },
      ],
    },
  ],
};

function fakeGenerateResponse(overrides: Partial<GenerateResponse> = {}): GenerateResponse {
  return {
    content: JSON.stringify(VALID_DRAFT),
    inputTokens: 300,
    outputTokens: 200,
    modelId: 'claude-content-model',
    latencyMs: 1200,
    ...overrides,
  };
}

const INPUT: DraftLessonRequest = {
  languageId: 'lang-es',
  targetLanguageName: 'Spanish',
  cefrLevel: 'A2',
  topic: 'Ordering food at a restaurant',
};

describe('ContentDraftingService', () => {
  function buildService(
    router: jest.Mocked<Pick<RouterService, 'generate'>>,
    safetyLayer: SafetyLayerService = realSafetyLayer(),
  ): ContentDraftingService {
    return new ContentDraftingService(router as unknown as RouterService, safetyLayer);
  }

  it("calls RouterService.generate with the 'content' request class", async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router);

    await service.draftLesson(INPUT);

    expect(router.generate).toHaveBeenCalledWith('content', expect.any(Object));
  });

  it('interpolates the language/CEFR level/topic into the rendered system prompt', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router);

    await service.draftLesson(INPUT);

    const call = router.generate.mock.calls[0]![1] as { systemPrompt: string };
    expect(call.systemPrompt).toContain('Spanish');
    expect(call.systemPrompt).toContain('A2');
    expect(call.systemPrompt).toContain('Ordering food at a restaurant');
  });

  it('returns a validated draft parsed from the model response', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(router);

    const result = await service.draftLesson(INPUT);

    expect(result.title).toBe('Ordering Food');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.exercises).toHaveLength(2);
  });

  it('tolerates a ```json markdown-fenced response (a common real-model quirk)', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({ content: '```json\n' + JSON.stringify(VALID_DRAFT) + '\n```' }),
    );
    const service = buildService(router);

    const result = await service.draftLesson(INPUT);

    expect(result.title).toBe('Ordering Food');
  });

  it('sanitizes every free-text field (description, activity title, exercise prompts) using the real SafetyLayerService', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          ...VALID_DRAFT,
          description: 'Learn phrases <script>alert(1)</script> for ordering.',
          activities: [
            {
              ...VALID_DRAFT.activities[0],
              title: 'At the <script>alert(1)</script> Restaurant',
              exercises: [
                {
                  type: 'MULTIPLE_CHOICE',
                  prompt: 'Choose <script>alert(1)</script> the right phrase',
                  correctAnswer: { correctIndex: 0 },
                },
              ],
            },
          ],
        }),
      }),
    );
    const service = buildService(router);

    const result = await service.draftLesson(INPUT);

    expect(result.description).not.toContain('<script>');
    expect(result.activities[0]?.title).not.toContain('<script>');
    expect(result.activities[0]?.exercises[0]?.prompt).not.toContain('<script>');
  });

  it('throws when the model response is not valid JSON', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse({ content: 'not json at all' }));
    const service = buildService(router);

    await expect(service.draftLesson(INPUT)).rejects.toThrow(/not valid JSON/);
  });

  it('throws when the model response is valid JSON but fails schema validation', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({ content: JSON.stringify({ title: 'Missing everything else' }) }),
    );
    const service = buildService(router);

    await expect(service.draftLesson(INPUT)).rejects.toThrow(/schema validation/);
  });

  it('throws when the model generates a SPEAKING_PROMPT exercise (rejected by the schema itself)', async () => {
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          ...VALID_DRAFT,
          activities: [
            {
              ...VALID_DRAFT.activities[0],
              exercises: [
                { type: 'SPEAKING_PROMPT', prompt: 'Say it out loud', correctAnswer: {} },
              ],
            },
          ],
        }),
      }),
    );
    const service = buildService(router);

    await expect(service.draftLesson(INPUT)).rejects.toThrow(/schema validation/);
  });

  describe('draftVocabularyItem', () => {
    const VOCAB_INPUT: DraftVocabularyItemRequest = {
      languageId: 'lang-es',
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2',
      term: 'hola',
    };

    const VALID_VOCAB_DRAFT = {
      term: 'hola',
      partOfSpeech: 'INTERJECTION',
      translations: { en: 'hello' },
      exampleSentences: [{ sentence: '¡Hola, amigo!', translation: 'Hello, friend!' }],
    };

    function fakeVocabGenerateResponse(
      overrides: Partial<GenerateResponse> = {},
    ): GenerateResponse {
      return {
        content: JSON.stringify(VALID_VOCAB_DRAFT),
        inputTokens: 100,
        outputTokens: 60,
        modelId: 'claude-content-model',
        latencyMs: 400,
        ...overrides,
      };
    }

    it("calls RouterService.generate with the 'content' request class", async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeVocabGenerateResponse());
      const service = buildService(router);

      await service.draftVocabularyItem(VOCAB_INPUT);

      expect(router.generate).toHaveBeenCalledWith('content', expect.any(Object));
    });

    it('interpolates the language/CEFR level/term into the rendered system prompt', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeVocabGenerateResponse());
      const service = buildService(router);

      await service.draftVocabularyItem(VOCAB_INPUT);

      const call = router.generate.mock.calls[0]![1] as { systemPrompt: string };
      expect(call.systemPrompt).toContain('Spanish');
      expect(call.systemPrompt).toContain('A2');
      expect(call.systemPrompt).toContain('hola');
    });

    it('returns a validated draft parsed from the model response', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeVocabGenerateResponse());
      const service = buildService(router);

      const result = await service.draftVocabularyItem(VOCAB_INPUT);

      expect(result.term).toBe('hola');
      expect(result.partOfSpeech).toBe('INTERJECTION');
      expect(result.translations).toEqual({ en: 'hello' });
    });

    it('tolerates a ```json markdown-fenced response (a common real-model quirk)', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(
        fakeVocabGenerateResponse({
          content: '```json\n' + JSON.stringify(VALID_VOCAB_DRAFT) + '\n```',
        }),
      );
      const service = buildService(router);

      const result = await service.draftVocabularyItem(VOCAB_INPUT);

      expect(result.term).toBe('hola');
    });

    it('sanitizes every model-generated free-text field (translations, example sentences) using the real SafetyLayerService', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(
        fakeVocabGenerateResponse({
          content: JSON.stringify({
            ...VALID_VOCAB_DRAFT,
            translations: { en: 'hello <script>alert(1)</script>' },
            exampleSentences: [
              {
                sentence: '¡Hola, <script>alert(1)</script>!',
                translation: 'Hello, <script>alert(1)</script>!',
              },
            ],
          }),
        }),
      );
      const service = buildService(router);

      const result = await service.draftVocabularyItem(VOCAB_INPUT);

      expect(result.translations.en).not.toContain('<script>');
      expect(result.exampleSentences?.[0]?.sentence).not.toContain('<script>');
      expect(result.exampleSentences?.[0]?.translation).not.toContain('<script>');
    });

    it('never sanitizes term -- it is admin-supplied input, not model-generated', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeVocabGenerateResponse());
      const service = buildService(router);

      const result = await service.draftVocabularyItem(VOCAB_INPUT);

      expect(result.term).toBe('hola');
    });

    it('throws when the model response is not valid JSON', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeVocabGenerateResponse({ content: 'not json at all' }));
      const service = buildService(router);

      await expect(service.draftVocabularyItem(VOCAB_INPUT)).rejects.toThrow(/not valid JSON/);
    });

    it('throws when the model response is valid JSON but fails schema validation', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(
        fakeVocabGenerateResponse({ content: JSON.stringify({ term: 'hola' }) }),
      );
      const service = buildService(router);

      await expect(service.draftVocabularyItem(VOCAB_INPUT)).rejects.toThrow(/schema validation/);
    });

    it('throws when the model returns translations with no entries (rejected by the schema itself)', async () => {
      const router = fakeRouter();
      router.generate.mockResolvedValue(
        fakeVocabGenerateResponse({
          content: JSON.stringify({ ...VALID_VOCAB_DRAFT, translations: {} }),
        }),
      );
      const service = buildService(router);

      await expect(service.draftVocabularyItem(VOCAB_INPUT)).rejects.toThrow(/schema validation/);
    });
  });
});
