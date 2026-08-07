import type { ScoreWritingRequest, WritingCritiqueSchema } from '@linguaai/validation/ai-coaching';

import { AssessmentScoringController } from './assessment-scoring.controller.js';
import type { AssessmentScoringService } from './assessment-scoring.service.js';

describe('AssessmentScoringController', () => {
  it('scoreWriting delegates to AssessmentScoringService.scoreWritingResponse and returns its result', async () => {
    const critique: WritingCritiqueSchema = { cefrLevel: 'B1', confidence: 0.7, feedback: 'Good.' };
    const assessmentScoring = {
      scoreWritingResponse: jest.fn().mockResolvedValue(critique),
    };
    const controller = new AssessmentScoringController(
      assessmentScoring as unknown as AssessmentScoringService,
    );
    const dto: ScoreWritingRequest = {
      languageId: 'lang-1',
      targetLanguageName: 'Spanish',
      prompt: 'Describe your ideal vacation.',
      learnerResponse: 'Mi vacacion ideal es en la playa.',
    };

    const result = await controller.scoreWriting(dto);

    expect(assessmentScoring.scoreWritingResponse).toHaveBeenCalledWith(dto);
    expect(result).toEqual(critique);
  });
});
