import type {
  StartSpeakingSessionRequest,
  StartSpeakingSessionResponse,
} from '@linguaai/validation/speaking';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { SpeakingController } from './speaking.controller.js';
import type { SpeakingService } from './speaking.service.js';

describe('SpeakingController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<SpeakingController['start']>[0];

  it('start delegates to SpeakingService.startSession with the caller and dto', async () => {
    const response: StartSpeakingSessionResponse = {
      sessionId: 'session-1',
      token: 'a.b',
      expiresInSeconds: 60,
    };
    const service = {
      startSession: jest.fn().mockResolvedValue(response),
    } as unknown as SpeakingService;
    const controller = new SpeakingController(service);
    const dto: StartSpeakingSessionRequest = { languageId: 'lang-1' };

    const result = await controller.start(req, dto);

    expect(service.startSession).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(response);
  });

  it('end delegates to SpeakingService.endSession with the caller and session id', async () => {
    const service = {
      endSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as SpeakingService;
    const controller = new SpeakingController(service);

    await controller.end(req, 'session-1');

    expect(service.endSession).toHaveBeenCalledWith(user, 'session-1');
  });
});
