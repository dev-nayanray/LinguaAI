import { NotFoundException } from '@nestjs/common';

import type { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { SpeechServiceClientService } from '../speech-service-client/speech-service-client.service.js';
import { PronunciationLabService } from './pronunciation-lab.service.js';

const CALLER: RequestUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  role: 'LEARNER',
  organizationId: null,
  orgRole: null,
};

const LANGUAGE_ID = '22222222-2222-2222-2222-222222222222';
const ATTEMPT_ID = '33333333-3333-3333-3333-333333333333';

const SCORE_RESULT = {
  overallScore: 88,
  accuracyScore: 90,
  fluencyScore: 85,
  completenessScore: 95,
  words: [{ word: 'hola', accuracyScore: 90, errorType: 'NONE' as const, phonemes: [] }],
};

function fakePrisma() {
  return {
    language: {
      findUnique: jest.fn().mockResolvedValue({ id: LANGUAGE_ID, code: 'es' }),
    },
    pronunciationLabAttempt: {
      create: jest.fn().mockResolvedValue({
        id: ATTEMPT_ID,
        userId: CALLER.userId,
        languageId: LANGUAGE_ID,
        targetPhrase: 'hola',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    pronunciationScore: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function fakeSpeechServiceClient(): jest.Mocked<
  Pick<SpeechServiceClientService, 'scorePronunciation'>
> {
  return { scorePronunciation: jest.fn().mockResolvedValue(SCORE_RESULT) };
}

function fakeEvents(): { publish: jest.Mock } {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  speechServiceClient: ReturnType<typeof fakeSpeechServiceClient>,
  events: ReturnType<typeof fakeEvents>,
): PronunciationLabService {
  return new PronunciationLabService(
    prisma as never,
    speechServiceClient as unknown as SpeechServiceClientService,
    events as unknown as DomainEventPublisher,
  );
}

describe('PronunciationLabService', () => {
  describe('createAttempt', () => {
    it('resolves the language BCP-47 locale, calls speech-service, and persists a real attempt + score row', async () => {
      const prisma = fakePrisma();
      const speechServiceClient = fakeSpeechServiceClient();
      const events = fakeEvents();
      const service = buildService(prisma, speechServiceClient, events);

      const result = await service.createAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        targetPhrase: 'hola',
        audio: 'YXVkaW8=',
      });

      expect(speechServiceClient.scorePronunciation).toHaveBeenCalledWith(
        'YXVkaW8=',
        'hola',
        'es-ES',
      );
      expect(prisma.pronunciationLabAttempt.create).toHaveBeenCalledWith({
        data: { userId: CALLER.userId, languageId: LANGUAGE_ID, targetPhrase: 'hola' },
      });
      expect(prisma.pronunciationScore.create).toHaveBeenCalledWith({
        data: {
          userId: CALLER.userId,
          sourceType: 'PRONUNCIATION_LAB_ATTEMPT',
          sourceId: ATTEMPT_ID,
          phonemeScores: SCORE_RESULT.words,
          overallScore: 88,
        },
      });
      expect(result).toEqual({
        attemptId: ATTEMPT_ID,
        languageId: LANGUAGE_ID,
        targetPhrase: 'hola',
        score: SCORE_RESULT,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('publishes pronunciation.attempt.scored with the real score shape', async () => {
      const prisma = fakePrisma();
      const speechServiceClient = fakeSpeechServiceClient();
      const events = fakeEvents();
      const service = buildService(prisma, speechServiceClient, events);

      await service.createAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        targetPhrase: 'hola',
        audio: 'YXVkaW8=',
      });

      expect(events.publish).toHaveBeenCalledWith('pronunciation.attempt.scored', {
        userId: CALLER.userId,
        payload: {
          attemptId: ATTEMPT_ID,
          languageId: LANGUAGE_ID,
          overallScore: 88,
          accuracyScore: 90,
          fluencyScore: 85,
          completenessScore: 95,
        },
      });
    });

    it('404s (not a silent failure) when the language does not exist, and never calls speech-service', async () => {
      const prisma = fakePrisma();
      prisma.language.findUnique.mockResolvedValue(null);
      const speechServiceClient = fakeSpeechServiceClient();
      const events = fakeEvents();
      const service = buildService(prisma, speechServiceClient, events);

      await expect(
        service.createAttempt(CALLER, {
          languageId: LANGUAGE_ID,
          targetPhrase: 'hola',
          audio: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(speechServiceClient.scorePronunciation).not.toHaveBeenCalled();
      expect(prisma.pronunciationLabAttempt.create).not.toHaveBeenCalled();
    });

    it('throws a real, honest error for a language with no known BCP-47 mapping, never calling speech-service', async () => {
      const prisma = fakePrisma();
      prisma.language.findUnique.mockResolvedValue({ id: LANGUAGE_ID, code: 'xx' });
      const speechServiceClient = fakeSpeechServiceClient();
      const events = fakeEvents();
      const service = buildService(prisma, speechServiceClient, events);

      await expect(
        service.createAttempt(CALLER, {
          languageId: LANGUAGE_ID,
          targetPhrase: 'hola',
          audio: 'x',
        }),
      ).rejects.toThrow('no known BCP-47 locale mapping');
      expect(speechServiceClient.scorePronunciation).not.toHaveBeenCalled();
    });
  });
});
