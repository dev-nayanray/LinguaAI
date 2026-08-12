import type { PrismaClient } from '@linguaai/database';

import type { GenerateResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { FluencyScoringService } from './fluency-scoring.service.js';

const SESSION_ID = 'session-1';
const LANGUAGE_ID = '22222222-2222-2222-2222-222222222222';

function fakeSession(): { id: string; languageId: string } {
  return { id: SESSION_ID, languageId: LANGUAGE_ID };
}

function fakeMessages(): { role: string; content: string; createdAt: Date }[] {
  return [
    {
      role: 'USER',
      content: 'Hola, quiero practicar.',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      role: 'ASSISTANT',
      content: '¡Claro! ¿De qué quieres hablar?',
      createdAt: new Date('2026-01-01T00:00:01Z'),
    },
  ];
}

function fakePrisma(
  overrides: {
    session?: ReturnType<typeof fakeSession> | null;
    messages?: ReturnType<typeof fakeMessages>;
    existingFluencyScore?: { overallScore: number; componentScores: unknown } | null;
  } = {},
) {
  return {
    aIAgentSession: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.session === undefined ? fakeSession() : overrides.session),
    },
    aIMessage: {
      findMany: jest.fn().mockResolvedValue(overrides.messages ?? fakeMessages()),
    },
    fluencyScore: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingFluencyScore ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    language: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: LANGUAGE_ID, name: 'Spanish' }),
    },
  } as unknown as PrismaClient & {
    aIAgentSession: { findUnique: jest.Mock };
    aIMessage: { findMany: jest.Mock };
    fluencyScore: { findFirst: jest.Mock; create: jest.Mock };
    language: { findUniqueOrThrow: jest.Mock };
  };
}

function fakeRouter(): jest.Mocked<Pick<RouterService, 'generate'>> {
  return { generate: jest.fn() };
}

function realSafetyLayer(): SafetyLayerService {
  return new SafetyLayerService();
}

function fakeGenerateResponse(overrides: Partial<GenerateResponse> = {}): GenerateResponse {
  return {
    content: JSON.stringify({
      overallScore: 78,
      componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
      feedback: 'Solid conversational flow.',
      vocabulary: [{ term: 'practicar', translation: 'to practice' }],
    }),
    inputTokens: 300,
    outputTokens: 90,
    modelId: 'claude-fluency-model',
    latencyMs: 1200,
    ...overrides,
  };
}

describe('FluencyScoringService', () => {
  function buildService(
    prisma: ReturnType<typeof fakePrisma>,
    router: jest.Mocked<Pick<RouterService, 'generate'>>,
    safetyLayer: SafetyLayerService = realSafetyLayer(),
  ): FluencyScoringService {
    return new FluencyScoringService(
      prisma as unknown as PrismaClient,
      router as unknown as RouterService,
      safetyLayer,
    );
  }

  it('404s (not a silent no-op) when the session does not exist', async () => {
    const prisma = fakePrisma({ session: null });
    const service = buildService(prisma, fakeRouter());

    await expect(service.scoreSessionAndExtractVocabulary(SESSION_ID)).rejects.toThrow(
      'AI agent session not found',
    );
  });

  it('returns a null fluencyScore and no vocabulary when the session had no real conversation', async () => {
    const prisma = fakePrisma({
      messages: [{ role: 'USER', content: 'hola', createdAt: new Date() }],
    });
    const router = fakeRouter();
    const service = buildService(prisma, router);

    const result = await service.scoreSessionAndExtractVocabulary(SESSION_ID);

    expect(result).toEqual({
      languageId: LANGUAGE_ID,
      fluencyScore: null,
      extractedVocabulary: [],
    });
    expect(router.generate).not.toHaveBeenCalled();
    expect(prisma.fluencyScore.create).not.toHaveBeenCalled();
  });

  it("calls RouterService.generate with the 'fluency' request class", async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(prisma, router);

    await service.scoreSessionAndExtractVocabulary(SESSION_ID);

    expect(router.generate).toHaveBeenCalledWith('fluency', expect.any(Object));
  });

  it('writes a real FluencyScore row and returns the validated result', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse());
    const service = buildService(prisma, router);

    const result = await service.scoreSessionAndExtractVocabulary(SESSION_ID);

    expect(prisma.fluencyScore.create).toHaveBeenCalledWith({
      data: {
        sessionId: SESSION_ID,
        overallScore: 78,
        componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
      },
    });
    expect(result).toEqual({
      languageId: LANGUAGE_ID,
      fluencyScore: {
        overallScore: 78,
        componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
        feedback: 'Solid conversational flow.',
      },
      extractedVocabulary: [{ term: 'practicar', translation: 'to practice', notes: undefined }],
    });
  });

  it('sanitizes feedback and extracted-vocabulary fields using the real SafetyLayerService', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({
        content: JSON.stringify({
          overallScore: 60,
          componentScores: { fluency: 60, coherence: 60, pronunciation: 60, grammar: 60 },
          feedback: 'Good <script>alert(1)</script> effort.',
          vocabulary: [{ term: 'hola', notes: '<script>alert(1)</script>greeting' }],
        }),
      }),
    );
    const service = buildService(prisma, router);

    const result = await service.scoreSessionAndExtractVocabulary(SESSION_ID);

    expect(result.fluencyScore?.feedback).not.toContain('<script>');
    expect(result.extractedVocabulary[0]?.notes).not.toContain('<script>');
  });

  it('returns the existing FluencyScore unchanged (idempotent) and no vocabulary on a repeat call, without calling the model again', async () => {
    const prisma = fakePrisma({
      existingFluencyScore: {
        overallScore: 90,
        componentScores: { fluency: 90, coherence: 90, pronunciation: 90, grammar: 90 },
      },
    });
    const router = fakeRouter();
    const service = buildService(prisma, router);

    const result = await service.scoreSessionAndExtractVocabulary(SESSION_ID);

    expect(router.generate).not.toHaveBeenCalled();
    expect(prisma.fluencyScore.create).not.toHaveBeenCalled();
    expect(result.fluencyScore?.overallScore).toBe(90);
    expect(result.extractedVocabulary).toEqual([]);
  });

  it('throws when the model response is not valid JSON', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.generate.mockResolvedValue(fakeGenerateResponse({ content: 'not json at all' }));
    const service = buildService(prisma, router);

    await expect(service.scoreSessionAndExtractVocabulary(SESSION_ID)).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('throws when the model response is valid JSON but fails schema validation', async () => {
    const prisma = fakePrisma();
    const router = fakeRouter();
    router.generate.mockResolvedValue(
      fakeGenerateResponse({ content: JSON.stringify({ overallScore: 200 }) }),
    );
    const service = buildService(prisma, router);

    await expect(service.scoreSessionAndExtractVocabulary(SESSION_ID)).rejects.toThrow(
      /schema validation/,
    );
  });
});
