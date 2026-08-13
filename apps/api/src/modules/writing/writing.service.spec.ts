import { NotFoundException } from '@nestjs/common';

import type { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { PersonalDictionaryService } from '../vocabulary/index.js';
import type { DomainEventPublisher } from '../../events/index.js';
import { WritingService } from './writing.service.js';

const CALLER: RequestUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  role: 'LEARNER',
  organizationId: null,
  orgRole: null,
};

const LANGUAGE_ID = '22222222-2222-2222-2222-222222222222';
const SUBMISSION_ID = '33333333-3333-3333-3333-333333333333';

const CORRECTION_RESULT = {
  corrections: [
    { original: 'Yo tiene', corrected: 'Yo tengo', explanation: 'Irregular conjugation.' },
  ],
  overallFeedback: 'Good effort overall.',
  cefrLevelEstimate: 'A2' as const,
};

function fakePrisma() {
  return {
    language: {
      findUnique: jest.fn().mockResolvedValue({ id: LANGUAGE_ID, name: 'Spanish' }),
    },
    writingSubmission: {
      create: jest.fn().mockResolvedValue({
        id: SUBMISSION_ID,
        userId: CALLER.userId,
        languageId: LANGUAGE_ID,
        text: 'Yo tiene un perro.',
        corrections: CORRECTION_RESULT.corrections,
        overallFeedback: CORRECTION_RESULT.overallFeedback,
        cefrLevelEstimate: CORRECTION_RESULT.cefrLevelEstimate,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
  };
}

function fakeAiEngineClient(): jest.Mocked<Pick<AiEngineClientService, 'correctWriting'>> {
  return { correctWriting: jest.fn().mockResolvedValue(CORRECTION_RESULT) };
}

function fakePersonalDictionary(): jest.Mocked<Pick<PersonalDictionaryService, 'create'>> {
  return { create: jest.fn().mockResolvedValue({}) };
}

function fakeEvents(): { publish: jest.Mock } {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  aiEngineClient: ReturnType<typeof fakeAiEngineClient>,
  personalDictionary: ReturnType<typeof fakePersonalDictionary>,
  events: ReturnType<typeof fakeEvents>,
): WritingService {
  return new WritingService(
    prisma as never,
    aiEngineClient as unknown as AiEngineClientService,
    personalDictionary as unknown as PersonalDictionaryService,
    events as unknown as DomainEventPublisher,
  );
}

describe('WritingService', () => {
  describe('submitWriting', () => {
    it("resolves the language's own name, calls ai-engine, and persists a real WritingSubmission row", async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const events = fakeEvents();
      const service = buildService(prisma, aiEngineClient, personalDictionary, events);

      const result = await service.submitWriting(CALLER, {
        languageId: LANGUAGE_ID,
        text: 'Yo tiene un perro.',
      });

      expect(aiEngineClient.correctWriting).toHaveBeenCalledWith({
        languageId: LANGUAGE_ID,
        targetLanguageName: 'Spanish',
        text: 'Yo tiene un perro.',
      });
      expect(prisma.writingSubmission.create).toHaveBeenCalledWith({
        data: {
          userId: CALLER.userId,
          languageId: LANGUAGE_ID,
          text: 'Yo tiene un perro.',
          corrections: CORRECTION_RESULT.corrections,
          overallFeedback: CORRECTION_RESULT.overallFeedback,
          cefrLevelEstimate: CORRECTION_RESULT.cefrLevelEstimate,
        },
      });
      expect(result).toEqual({
        submissionId: SUBMISSION_ID,
        languageId: LANGUAGE_ID,
        text: 'Yo tiene un perro.',
        corrections: CORRECTION_RESULT.corrections,
        overallFeedback: CORRECTION_RESULT.overallFeedback,
        cefrLevelEstimate: CORRECTION_RESULT.cefrLevelEstimate,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('saves each correction into the personal dictionary with source WRITING', async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const events = fakeEvents();
      const service = buildService(prisma, aiEngineClient, personalDictionary, events);

      await service.submitWriting(CALLER, { languageId: LANGUAGE_ID, text: 'Yo tiene un perro.' });

      expect(personalDictionary.create).toHaveBeenCalledWith(CALLER, {
        languageId: LANGUAGE_ID,
        term: 'Yo tengo',
        source: 'WRITING',
        notes: 'Irregular conjugation.',
      });
    });

    it('never calls the personal dictionary when there are no corrections', async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      aiEngineClient.correctWriting.mockResolvedValue({
        corrections: [],
        overallFeedback: 'Perfect!',
        cefrLevelEstimate: 'B2',
      });
      const personalDictionary = fakePersonalDictionary();
      const events = fakeEvents();
      const service = buildService(prisma, aiEngineClient, personalDictionary, events);

      await service.submitWriting(CALLER, { languageId: LANGUAGE_ID, text: 'Perfecto.' });

      expect(personalDictionary.create).not.toHaveBeenCalled();
    });

    it('publishes writing.submission.corrected with the real correction shape', async () => {
      const prisma = fakePrisma();
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const events = fakeEvents();
      const service = buildService(prisma, aiEngineClient, personalDictionary, events);

      await service.submitWriting(CALLER, { languageId: LANGUAGE_ID, text: 'Yo tiene un perro.' });

      expect(events.publish).toHaveBeenCalledWith('writing.submission.corrected', {
        userId: CALLER.userId,
        payload: {
          submissionId: SUBMISSION_ID,
          languageId: LANGUAGE_ID,
          correctionCount: 1,
          cefrLevelEstimate: 'A2',
        },
      });
    });

    it('404s (not a silent failure) when the language does not exist, and never calls ai-engine', async () => {
      const prisma = fakePrisma();
      prisma.language.findUnique.mockResolvedValue(null);
      const aiEngineClient = fakeAiEngineClient();
      const personalDictionary = fakePersonalDictionary();
      const events = fakeEvents();
      const service = buildService(prisma, aiEngineClient, personalDictionary, events);

      await expect(
        service.submitWriting(CALLER, { languageId: LANGUAGE_ID, text: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(aiEngineClient.correctWriting).not.toHaveBeenCalled();
      expect(prisma.writingSubmission.create).not.toHaveBeenCalled();
    });
  });
});
