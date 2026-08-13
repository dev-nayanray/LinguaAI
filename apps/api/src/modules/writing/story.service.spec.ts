import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { PersonalDictionaryService } from '../vocabulary/index.js';
import { StoryService } from './story.service.js';

const CALLER: RequestUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  role: 'LEARNER',
  organizationId: null,
  orgRole: null,
};

const LANGUAGE_ID = '22222222-2222-2222-2222-222222222222';
const STORY_ID = '33333333-3333-3333-3333-333333333333';

const STORY_DRAFT = {
  title: 'Un Día con Mi Perro',
  storyText: 'Tengo un perro y un gato.',
  vocabularyUsed: ['perro', 'gato'],
};

function fakePrisma() {
  return {
    language: {
      findUnique: jest.fn().mockResolvedValue({ id: LANGUAGE_ID, name: 'Spanish' }),
    },
    proficiencyLevel: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    generatedStory: {
      create: jest.fn().mockResolvedValue({
        id: STORY_ID,
        userId: CALLER.userId,
        languageId: LANGUAGE_ID,
        title: STORY_DRAFT.title,
        storyText: STORY_DRAFT.storyText,
        vocabularyUsed: STORY_DRAFT.vocabularyUsed,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
  };
}

function fakeAiEngineClient(): jest.Mocked<Pick<AiEngineClientService, 'draftStory'>> {
  return { draftStory: jest.fn().mockResolvedValue(STORY_DRAFT) };
}

function fakePersonalDictionary(
  terms: string[] = ['perro', 'gato'],
): jest.Mocked<Pick<PersonalDictionaryService, 'list'>> {
  return {
    list: jest.fn().mockResolvedValue({
      data: terms.map((term, i) => ({
        id: `entry-${i}`,
        userId: CALLER.userId,
        languageId: LANGUAGE_ID,
        term,
        translation: null,
        source: 'MANUAL',
        notes: null,
        vocabularyItemId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
      meta: { nextCursor: null },
    }),
  };
}

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  aiEngineClient: ReturnType<typeof fakeAiEngineClient>,
  personalDictionary: ReturnType<typeof fakePersonalDictionary>,
): StoryService {
  return new StoryService(
    prisma as never,
    aiEngineClient as unknown as AiEngineClientService,
    personalDictionary as unknown as PersonalDictionaryService,
  );
}

describe('StoryService', () => {
  describe('generateStory', () => {
    it("queries the caller's own personal dictionary and passes those terms to ai-engine", async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary(['perro', 'gato']);
      const service = buildService(prisma, aiEngineClient, personalDictionary);

      await service.generateStory(CALLER, { languageId: LANGUAGE_ID });

      expect(personalDictionary.list).toHaveBeenCalledWith(CALLER, {
        languageId: LANGUAGE_ID,
        limit: 8,
      });
      expect(aiEngineClient.draftStory).toHaveBeenCalledWith({
        languageId: LANGUAGE_ID,
        targetLanguageName: 'Spanish',
        cefrLevel: 'A1',
        vocabularyTerms: ['perro', 'gato'],
      });
    });

    it("uses the caller's own READING ProficiencyLevel when one exists, instead of the A1 default", async () => {
      const prisma = fakePrisma();
      prisma.proficiencyLevel.findUnique.mockResolvedValue({ cefrLevel: 'B1' });
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const service = buildService(prisma, aiEngineClient, personalDictionary);

      await service.generateStory(CALLER, { languageId: LANGUAGE_ID });

      expect(prisma.proficiencyLevel.findUnique).toHaveBeenCalledWith({
        where: {
          userId_languageId_skill: {
            userId: CALLER.userId,
            languageId: LANGUAGE_ID,
            skill: 'READING',
          },
        },
      });
      expect(aiEngineClient.draftStory).toHaveBeenCalledWith(
        expect.objectContaining({ cefrLevel: 'B1' }),
      );
    });

    it('persists a real GeneratedStory row and returns its wire shape', async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const service = buildService(prisma, aiEngineClient, personalDictionary);

      const result = await service.generateStory(CALLER, { languageId: LANGUAGE_ID });

      expect(prisma.generatedStory.create).toHaveBeenCalledWith({
        data: {
          userId: CALLER.userId,
          languageId: LANGUAGE_ID,
          title: STORY_DRAFT.title,
          storyText: STORY_DRAFT.storyText,
          vocabularyUsed: STORY_DRAFT.vocabularyUsed,
        },
      });
      expect(result).toEqual({
        storyId: STORY_ID,
        languageId: LANGUAGE_ID,
        title: STORY_DRAFT.title,
        storyText: STORY_DRAFT.storyText,
        vocabularyUsed: STORY_DRAFT.vocabularyUsed,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('throws a real, honest error (never a meaningless fallback term) when the caller has no saved vocabulary yet', async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary([]);
      const service = buildService(prisma, aiEngineClient, personalDictionary);

      await expect(service.generateStory(CALLER, { languageId: LANGUAGE_ID })).rejects.toThrow(
        BadRequestException,
      );
      expect(aiEngineClient.draftStory).not.toHaveBeenCalled();
    });

    it('404s (not a silent failure) when the language does not exist, and never calls ai-engine', async () => {
      const prisma = fakePrisma();
      prisma.language.findUnique.mockResolvedValue(null);
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const service = buildService(prisma, aiEngineClient, personalDictionary);

      await expect(service.generateStory(CALLER, { languageId: LANGUAGE_ID })).rejects.toThrow(
        NotFoundException,
      );
      expect(aiEngineClient.draftStory).not.toHaveBeenCalled();
    });
  });
});
