import type { ContentDraftLesson, DraftLessonRequest } from '@linguaai/validation/content';

import { ContentAuthoringController } from './content-authoring.controller.js';
import type { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';

describe('ContentAuthoringController', () => {
  it('draftLesson delegates to AiEngineClientService.draftLesson and returns its result unmodified', async () => {
    const draft: ContentDraftLesson = {
      title: 'Ordering Food',
      description: 'Learn key phrases for ordering food.',
      estimatedMinutes: 10,
      activities: [
        {
          type: 'READING',
          title: 'At the Restaurant',
          content: {},
          exercises: [
            { type: 'MULTIPLE_CHOICE', prompt: 'Choose the right phrase', correctAnswer: {} },
          ],
        },
      ],
    };
    const aiEngineClient = { draftLesson: jest.fn().mockResolvedValue(draft) };
    const controller = new ContentAuthoringController(
      aiEngineClient as unknown as AiEngineClientService,
    );
    const dto: DraftLessonRequest = {
      languageId: 'lang-1',
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2',
      topic: 'Ordering food at a restaurant',
    };

    const result = await controller.draftLesson(dto);

    expect(aiEngineClient.draftLesson).toHaveBeenCalledWith(dto);
    expect(result).toBe(draft);
  });
});
