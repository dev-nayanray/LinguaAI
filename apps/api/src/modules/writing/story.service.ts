import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CefrLevel, PrismaClient } from '@linguaai/database';
import type { CreateStoryRequest, GeneratedStoryResponse } from '@linguaai/validation/ai-coaching';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PersonalDictionaryService } from '../vocabulary/index.js';

/**
 * The most recently added/reviewed vocabulary terms to build a story
 * around — a real, provisional MVP scoping call (design doc §10 open
 * question 2), avoiding both an unnaturally word-stuffed story and an
 * unbounded prompt.
 */
const STORY_VOCABULARY_TERM_COUNT = 8;

/** Same safe-beginner default `CourseCatalogService.getMatchedReadingActivities()` (E12 T2) already established for a learner never assessed. */
const DEFAULT_STORY_CEFR_LEVEL: CefrLevel = 'A1';

/**
 * `WritingModule`'s story-generation path (E13 T3, design doc §6.3).
 * Unlike `WritingService.submitWriting()`, the caller never supplies the
 * story's own subject matter — this service derives it entirely from the
 * caller's own already-saved `PersonalDictionary`, the same "the server
 * derives what it already owns" discipline `createStoryRequestSchema`'s
 * own header comment already establishes.
 */
@Injectable()
export class StoryService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly aiEngineClient: AiEngineClientService,
    private readonly personalDictionary: PersonalDictionaryService,
  ) {}

  async generateStory(
    caller: RequestUser,
    dto: CreateStoryRequest,
  ): Promise<GeneratedStoryResponse> {
    const language = await this.appPrisma.language.findUnique({ where: { id: dto.languageId } });
    if (!language) {
      throw new NotFoundException('Language not found');
    }

    const dictionary = await this.personalDictionary.list(caller, {
      languageId: dto.languageId,
      limit: STORY_VOCABULARY_TERM_COUNT,
    });
    if (dictionary.data.length === 0) {
      throw new BadRequestException(
        'No saved vocabulary yet for this language — save at least one term to your personal dictionary before generating a story',
      );
    }
    const vocabularyTerms = dictionary.data.map((entry) => entry.term);

    // A generated story is read content — reuses the same "READING-skill
    // ProficiencyLevel, defaulting to A1 for a never-assessed learner"
    // precedent `CourseCatalogService.getMatchedReadingActivities()`
    // (E12 T2) already established, rather than a new, arbitrary guess.
    const proficiency = await this.appPrisma.proficiencyLevel.findUnique({
      where: {
        userId_languageId_skill: {
          userId: caller.userId,
          languageId: dto.languageId,
          skill: 'READING',
        },
      },
    });
    const cefrLevel: CefrLevel = proficiency?.cefrLevel ?? DEFAULT_STORY_CEFR_LEVEL;

    const draft = await this.aiEngineClient.draftStory({
      languageId: dto.languageId,
      targetLanguageName: language.name,
      cefrLevel,
      vocabularyTerms,
    });

    const story = await this.appPrisma.generatedStory.create({
      data: {
        userId: caller.userId,
        languageId: dto.languageId,
        title: draft.title,
        storyText: draft.storyText,
        vocabularyUsed: draft.vocabularyUsed,
      },
    });

    return {
      storyId: story.id,
      languageId: dto.languageId,
      title: story.title,
      storyText: story.storyText,
      vocabularyUsed: story.vocabularyUsed,
      createdAt: story.createdAt.toISOString(),
    };
  }
}
