import { verifySpeechSessionToken } from '@linguaai/utils';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
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

describe('SpeakingService', () => {
  describe('startSession', () => {
    it('starts a real AIAgentSession as CONVERSATION_PARTNER and returns a verifiable, correctly-scoped token', async () => {
      const aiEngineClient = {
        startSession: jest.fn().mockResolvedValue({ sessionId: 'session-1' }),
      };
      const service = new SpeakingService(aiEngineClient as unknown as AiEngineClientService, {
        secret: 'shared-secret',
      });
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
      const aiEngineClient = { endSession: jest.fn().mockResolvedValue(undefined) };
      const service = new SpeakingService(aiEngineClient as unknown as AiEngineClientService, {
        secret: 'shared-secret',
      });
      const caller = fakeCaller();

      await service.endSession(caller, 'session-1');

      expect(aiEngineClient.endSession).toHaveBeenCalledWith('session-1', caller.userId);
    });
  });
});
