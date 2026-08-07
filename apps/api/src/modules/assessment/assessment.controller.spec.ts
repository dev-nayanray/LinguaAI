import type {
  CompleteAssessmentAttemptResponse,
  StartAssessmentAttemptRequest,
  StartAssessmentAttemptResponse,
  SubmitAssessmentResponseRequest,
  SubmitAssessmentResponseResponse,
} from '@linguaai/validation/learning';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AssessmentController } from './assessment.controller.js';
import type { AssessmentService } from './assessment.service.js';

describe('AssessmentController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<AssessmentController['start']>[0];

  it('start delegates to AssessmentService.startAttempt with the caller and dto', async () => {
    const response: StartAssessmentAttemptResponse = {
      attempt: {
        id: 'attempt-1',
        userId: user.userId,
        languageId: 'lang-1',
        type: 'PLACEMENT',
        status: 'IN_PROGRESS',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: null,
      },
      nextItem: {
        id: 'item-1',
        skill: 'READING',
        cefrLevel: 'B1',
        difficulty: 0.5,
        prompt: 'prompt',
        audioUrl: null,
        itemType: 'MULTIPLE_CHOICE',
      },
    };
    const service = {
      startAttempt: jest.fn().mockResolvedValue(response),
    } as unknown as AssessmentService;
    const controller = new AssessmentController(service);
    const dto: StartAssessmentAttemptRequest = { languageId: 'lang-1', type: 'PLACEMENT' };

    const result = await controller.start(req, dto);

    expect(service.startAttempt).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(response);
  });

  it('submitResponse delegates to AssessmentService.submitResponse with the caller, attempt id, and dto', async () => {
    const response: SubmitAssessmentResponseResponse = {
      response: { id: 'resp-1', isCorrect: true, score: 1 },
      nextItem: null,
      attemptStatus: 'IN_PROGRESS',
    };
    const service = {
      submitResponse: jest.fn().mockResolvedValue(response),
    } as unknown as AssessmentService;
    const controller = new AssessmentController(service);
    const dto: SubmitAssessmentResponseRequest = {
      itemId: 'item-1',
      response: { selectedIndex: 0 },
    };

    const result = await controller.submitResponse(req, 'attempt-1', dto);

    expect(service.submitResponse).toHaveBeenCalledWith(user, 'attempt-1', dto);
    expect(result).toBe(response);
  });

  it('complete delegates to AssessmentService.completeAttempt with the caller and attempt id', async () => {
    const response: CompleteAssessmentAttemptResponse = {
      attempt: {
        id: 'attempt-1',
        userId: user.userId,
        languageId: 'lang-1',
        type: 'PLACEMENT',
        status: 'COMPLETED',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:10:00.000Z',
      },
      responses: [],
      proficiencyLevels: [],
      retakeRecommended: false,
    };
    const service = {
      completeAttempt: jest.fn().mockResolvedValue(response),
    } as unknown as AssessmentService;
    const controller = new AssessmentController(service);

    const result = await controller.complete(req, 'attempt-1');

    expect(service.completeAttempt).toHaveBeenCalledWith(user, 'attempt-1');
    expect(result).toBe(response);
  });
});
