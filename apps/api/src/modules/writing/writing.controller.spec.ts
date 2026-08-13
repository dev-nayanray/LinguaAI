import type {
  CreateWritingSubmissionRequest,
  WritingSubmissionResponse,
} from '@linguaai/validation/ai-coaching';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { WritingController } from './writing.controller.js';
import type { WritingService } from './writing.service.js';

describe('WritingController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'LEARNER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<WritingController['create']>[0];

  it('create delegates to WritingService.submitWriting with the caller and dto', async () => {
    const response: WritingSubmissionResponse = {
      submissionId: 'submission-1',
      languageId: 'lang-1',
      text: 'Yo tiene un perro.',
      corrections: [],
      overallFeedback: 'Great job!',
      cefrLevelEstimate: 'B1',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const service = {
      submitWriting: jest.fn().mockResolvedValue(response),
    } as unknown as WritingService;
    const controller = new WritingController(service);
    const dto: CreateWritingSubmissionRequest = {
      languageId: 'lang-1',
      text: 'Yo tiene un perro.',
    };

    const result = await controller.create(req, dto);

    expect(service.submitWriting).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(response);
  });
});
