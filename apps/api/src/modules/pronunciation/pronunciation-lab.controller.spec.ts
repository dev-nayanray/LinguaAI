import type {
  CreatePronunciationAttemptRequest,
  PronunciationAttemptResponse,
} from '@linguaai/validation/pronunciation';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PronunciationLabController } from './pronunciation-lab.controller.js';
import type { PronunciationLabService } from './pronunciation-lab.service.js';

describe('PronunciationLabController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'LEARNER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<PronunciationLabController['create']>[0];

  it('create delegates to PronunciationLabService.createAttempt with the caller and dto', async () => {
    const response: PronunciationAttemptResponse = {
      attemptId: 'attempt-1',
      languageId: 'lang-1',
      targetPhrase: 'hola',
      score: {
        overallScore: 88,
        accuracyScore: 90,
        fluencyScore: 85,
        completenessScore: 95,
        words: [],
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const service = {
      createAttempt: jest.fn().mockResolvedValue(response),
    } as unknown as PronunciationLabService;
    const controller = new PronunciationLabController(service);
    const dto: CreatePronunciationAttemptRequest = {
      languageId: 'lang-1',
      targetPhrase: 'hola',
      audio: 'YXVkaW8=',
    };

    const result = await controller.create(req, dto);

    expect(service.createAttempt).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(response);
  });
});
