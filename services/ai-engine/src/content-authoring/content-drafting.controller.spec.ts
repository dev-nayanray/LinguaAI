import type { ContentDraftLesson, DraftLessonRequest } from '@linguaai/validation/content';

import { ContentDraftingController } from './content-drafting.controller.js';
import type { ContentDraftingService } from './content-drafting.service.js';

describe('ContentDraftingController', () => {
  it('draftLesson delegates to ContentDraftingService.draftLesson and returns its result', async () => {
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
    const contentDrafting = { draftLesson: jest.fn().mockResolvedValue(draft) };
    const controller = new ContentDraftingController(
      contentDrafting as unknown as ContentDraftingService,
    );
    const dto: DraftLessonRequest = {
      languageId: 'lang-1',
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2',
      topic: 'Ordering food at a restaurant',
    };

    const result = await controller.draftLesson(dto);

    expect(contentDrafting.draftLesson).toHaveBeenCalledWith(dto);
    expect(result).toEqual(draft);
  });
});
