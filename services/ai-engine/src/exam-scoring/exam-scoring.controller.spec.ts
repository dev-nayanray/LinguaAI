import type { ExamSectionScore, ScoreExamSectionRequest } from '@linguaai/validation/ai-coaching';

import { ExamScoringController } from './exam-scoring.controller.js';
import type { ExamScoringService } from './exam-scoring.service.js';

describe('ExamScoringController', () => {
  it('scoreSection delegates to ExamScoringService.scoreSection and returns its result', async () => {
    const score: ExamSectionScore = { band: 6.5, feedback: 'Solid response overall.' };
    const examScoring = { scoreSection: jest.fn().mockResolvedValue(score) };
    const controller = new ExamScoringController(examScoring as unknown as ExamScoringService);
    const dto: ScoreExamSectionRequest = {
      skill: 'WRITING',
      taskPrompt: 'Describe a chart.',
      learnerResponse: 'The chart shows a steady increase.',
    };

    const result = await controller.scoreSection(dto);

    expect(examScoring.scoreSection).toHaveBeenCalledWith(dto);
    expect(result).toEqual(score);
  });
});
