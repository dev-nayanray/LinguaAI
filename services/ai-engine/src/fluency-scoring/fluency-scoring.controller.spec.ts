import type { ScoreFluencyRequest, ScoreFluencyResponse } from '@linguaai/validation/ai-coaching';

import { FluencyScoringController } from './fluency-scoring.controller.js';
import type { FluencyScoringService } from './fluency-scoring.service.js';

describe('FluencyScoringController', () => {
  it('score delegates to FluencyScoringService.scoreSessionAndExtractVocabulary and returns its result', async () => {
    const response: ScoreFluencyResponse = {
      languageId: '22222222-2222-2222-2222-222222222222',
      fluencyScore: {
        overallScore: 78,
        componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
        feedback: 'Solid.',
      },
      extractedVocabulary: [],
    };
    const fluencyScoring = {
      scoreSessionAndExtractVocabulary: jest.fn().mockResolvedValue(response),
    };
    const controller = new FluencyScoringController(
      fluencyScoring as unknown as FluencyScoringService,
    );
    const dto: ScoreFluencyRequest = { sessionId: 'session-1' };

    const result = await controller.score(dto);

    expect(fluencyScoring.scoreSessionAndExtractVocabulary).toHaveBeenCalledWith('session-1');
    expect(result).toEqual(response);
  });
});
