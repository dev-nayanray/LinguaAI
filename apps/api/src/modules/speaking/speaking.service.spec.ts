import { verifySpeechSessionToken } from '@linguaai/utils';

import type { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import type { PersonalDictionaryService } from '../vocabulary/index.js';
import { SpeakingService } from './speaking.service.js';

function fakeCaller(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    userId: '11111111-1111-1111-1111-111111111111',
    role: 'LEARNER',
    organizationId: null,
    orgRole: null,
    ...overrides,
  };
}

function fakeAiEngineClient(): {
  startSession: jest.Mock;
  endSession: jest.Mock;
  scoreFluencyAndExtractVocabulary: jest.Mock;
} {
  return {
    startSession: jest.fn(),
    endSession: jest.fn().mockResolvedValue(undefined),
    scoreFluencyAndExtractVocabulary: jest.fn().mockResolvedValue({
      languageId: '22222222-2222-2222-2222-222222222222',
      fluencyScore: null,
      extractedVocabulary: [],
    }),
  };
}

function fakePersonalDictionary(): { create: jest.Mock } {
  return { create: jest.fn().mockResolvedValue({}) };
}

function fakeEvents(): { publish: jest.Mock } {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function buildService(
  aiEngineClient: ReturnType<typeof fakeAiEngineClient>,
  personalDictionary: ReturnType<typeof fakePersonalDictionary> = fakePersonalDictionary(),
  events: ReturnType<typeof fakeEvents> = fakeEvents(),
): SpeakingService {
  return new SpeakingService(
    aiEngineClient as unknown as AiEngineClientService,
    personalDictionary as unknown as PersonalDictionaryService,
    events as unknown as DomainEventPublisher,
    { secret: 'shared-secret' },
  );
}

describe('SpeakingService', () => {
  describe('startSession', () => {
    it('starts a real AIAgentSession as CONVERSATION_PARTNER and returns a verifiable, correctly-scoped token', async () => {
      const aiEngineClient = fakeAiEngineClient();
      aiEngineClient.startSession.mockResolvedValue({ sessionId: 'session-1' });
      const service = buildService(aiEngineClient);
      const caller = fakeCaller();

      const result = await service.startSession(caller, {
        languageId: '22222222-2222-2222-2222-222222222222',
      });

      expect(aiEngineClient.startSession).toHaveBeenCalledWith({
        userId: caller.userId,
        languageId: '22222222-2222-2222-2222-222222222222',
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });
      expect(result).toEqual({
        sessionId: 'session-1',
        token: expect.any(String),
        expiresInSeconds: 60,
      });

      const verification = verifySpeechSessionToken(result.token, 'shared-secret', 'session-1');
      expect(verification).toEqual({
        valid: true,
        claims: { sessionId: 'session-1', userId: caller.userId },
      });
    });
  });

  describe('endSession', () => {
    it('forwards the caller own userId so ai-engine can enforce ownership', async () => {
      const aiEngineClient = fakeAiEngineClient();
      const service = buildService(aiEngineClient);
      const caller = fakeCaller();

      await service.endSession(caller, '33333333-3333-3333-3333-333333333333');

      expect(aiEngineClient.endSession).toHaveBeenCalledWith(
        '33333333-3333-3333-3333-333333333333',
        caller.userId,
      );
    });

    it('saves each extracted vocabulary term into the caller own personal dictionary, sourced CONVERSATION', async () => {
      const aiEngineClient = fakeAiEngineClient();
      aiEngineClient.scoreFluencyAndExtractVocabulary.mockResolvedValue({
        languageId: '22222222-2222-2222-2222-222222222222',
        fluencyScore: {
          overallScore: 78,
          componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
          feedback: 'Solid.',
        },
        extractedVocabulary: [
          { term: 'hola', translation: 'hello', notes: undefined },
          { term: 'gracias', translation: undefined, notes: 'polite' },
        ],
      });
      const personalDictionary = fakePersonalDictionary();
      const service = buildService(aiEngineClient, personalDictionary);
      const caller = fakeCaller();

      await service.endSession(caller, '33333333-3333-3333-3333-333333333333');

      expect(personalDictionary.create).toHaveBeenCalledTimes(2);
      expect(personalDictionary.create).toHaveBeenNthCalledWith(1, caller, {
        languageId: '22222222-2222-2222-2222-222222222222',
        term: 'hola',
        translation: 'hello',
        source: 'CONVERSATION',
        notes: undefined,
      });
      expect(personalDictionary.create).toHaveBeenNthCalledWith(2, caller, {
        languageId: '22222222-2222-2222-2222-222222222222',
        term: 'gracias',
        translation: undefined,
        source: 'CONVERSATION',
        notes: 'polite',
      });
    });

    it('publishes speech.session.ended with the real fluency-score shape', async () => {
      const aiEngineClient = fakeAiEngineClient();
      aiEngineClient.scoreFluencyAndExtractVocabulary.mockResolvedValue({
        languageId: '22222222-2222-2222-2222-222222222222',
        fluencyScore: {
          overallScore: 78,
          componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
          feedback: 'Solid.',
        },
        extractedVocabulary: [{ term: 'hola', translation: 'hello', notes: undefined }],
      });
      const events = fakeEvents();
      const service = buildService(aiEngineClient, fakePersonalDictionary(), events);
      const caller = fakeCaller();

      await service.endSession(caller, '33333333-3333-3333-3333-333333333333');

      expect(events.publish).toHaveBeenCalledWith('speech.session.ended', {
        userId: caller.userId,
        payload: {
          sessionId: '33333333-3333-3333-3333-333333333333',
          languageId: '22222222-2222-2222-2222-222222222222',
          overallScore: 78,
          componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
          vocabularyExtractedCount: 1,
        },
      });
    });

    it('publishes a null overallScore/componentScores when the session had no real content to score', async () => {
      const aiEngineClient = fakeAiEngineClient();
      const events = fakeEvents();
      const service = buildService(aiEngineClient, fakePersonalDictionary(), events);
      const caller = fakeCaller();

      await service.endSession(caller, '33333333-3333-3333-3333-333333333333');

      expect(events.publish).toHaveBeenCalledWith('speech.session.ended', {
        userId: caller.userId,
        payload: expect.objectContaining({
          overallScore: null,
          componentScores: null,
          vocabularyExtractedCount: 0,
        }),
      });
    });
  });
});
