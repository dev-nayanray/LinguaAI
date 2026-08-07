import type { ExerciseAttemptResultResponse } from '@linguaai/validation/content';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { ExerciseAttemptsController } from './exercise-attempts.controller.js';
import type { ExerciseAttemptsService } from './exercise-attempts.service.js';

describe('ExerciseAttemptsController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<ExerciseAttemptsController['submitAttempt']>[0];

  it('submitAttempt delegates to the service with the caller, exercise id, and dto', async () => {
    const response: ExerciseAttemptResultResponse = { id: 'attempt-1', isCorrect: true, score: 1 };
    const service = {
      submitAttempt: jest.fn().mockResolvedValue(response),
    } as unknown as ExerciseAttemptsService;
    const controller = new ExerciseAttemptsController(service);
    const dto = { response: { selectedIndex: 0 } };

    const result = await controller.submitAttempt(req, 'ex-1', dto);

    expect(service.submitAttempt).toHaveBeenCalledWith(user, 'ex-1', dto);
    expect(result).toBe(response);
  });
});
