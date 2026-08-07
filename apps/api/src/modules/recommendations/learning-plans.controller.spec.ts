import type { LearningPlanResponse } from '@linguaai/validation/learning';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { LearningPlansController } from './learning-plans.controller.js';
import type { LearningPlansService } from './learning-plans.service.js';

describe('LearningPlansController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<LearningPlansController['getCurrent']>[0];

  it('getCurrent delegates to LearningPlansService.getCurrent with the caller and query', async () => {
    const response: LearningPlanResponse = {
      id: 'plan-1',
      userId: user.userId,
      languageId: 'lang-1',
      goal: 'Conversational fluency',
      targetDate: null,
      milestones: {},
      isActive: true,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const service = {
      getCurrent: jest.fn().mockResolvedValue(response),
    } as unknown as LearningPlansService;
    const controller = new LearningPlansController(service);

    const result = await controller.getCurrent(req, { languageId: 'lang-1' });

    expect(service.getCurrent).toHaveBeenCalledWith(user, { languageId: 'lang-1' });
    expect(result).toBe(response);
  });
});
