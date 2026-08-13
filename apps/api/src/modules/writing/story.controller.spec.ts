import type { CreateStoryRequest, GeneratedStoryResponse } from '@linguaai/validation/ai-coaching';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { StoryController } from './story.controller.js';
import type { StoryService } from './story.service.js';

describe('StoryController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'LEARNER', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<StoryController['create']>[0];

  it('create delegates to StoryService.generateStory with the caller and dto', async () => {
    const response: GeneratedStoryResponse = {
      storyId: 'story-1',
      languageId: 'lang-1',
      title: 'Un Día con Mi Perro',
      storyText: 'Tengo un perro.',
      vocabularyUsed: ['perro'],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const service = {
      generateStory: jest.fn().mockResolvedValue(response),
    } as unknown as StoryService;
    const controller = new StoryController(service);
    const dto: CreateStoryRequest = { languageId: 'lang-1' };

    const result = await controller.create(req, dto);

    expect(service.generateStory).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(response);
  });
});
