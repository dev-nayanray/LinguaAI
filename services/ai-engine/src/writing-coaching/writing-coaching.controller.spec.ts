import type {
  CorrectWritingRequest,
  WritingCorrectionResult,
} from '@linguaai/validation/ai-coaching';

import { WritingCoachingController } from './writing-coaching.controller.js';
import type { WritingCoachService } from './writing-coaching.service.js';

describe('WritingCoachingController', () => {
  it('correct delegates to WritingCoachService.correctWriting and returns its result', async () => {
    const correctionResult: WritingCorrectionResult = {
      corrections: [],
      overallFeedback: 'Great job!',
      cefrLevelEstimate: 'B1',
    };
    const writingCoach = {
      correctWriting: jest.fn().mockResolvedValue(correctionResult),
    };
    const controller = new WritingCoachingController(
      writingCoach as unknown as WritingCoachService,
    );
    const dto: CorrectWritingRequest = {
      languageId: 'lang-1',
      targetLanguageName: 'Spanish',
      text: 'Yo tiene un perro.',
    };

    const result = await controller.correct(dto);

    expect(writingCoach.correctWriting).toHaveBeenCalledWith(dto);
    expect(result).toEqual(correctionResult);
  });
});
