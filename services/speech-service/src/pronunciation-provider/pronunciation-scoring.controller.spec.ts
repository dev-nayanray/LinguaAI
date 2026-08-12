import type { PronunciationProvider } from './pronunciation-provider.interface.js';
import { PronunciationScoringController } from './pronunciation-scoring.controller.js';

describe('PronunciationScoringController', () => {
  it('base64-decodes the audio and delegates to the provider, returning its raw result', async () => {
    const scoreResult = {
      overallScore: 90,
      accuracyScore: 88,
      fluencyScore: 92,
      completenessScore: 100,
      words: [],
    };
    const scorePronunciation = jest.fn().mockResolvedValue(scoreResult);
    const provider: PronunciationProvider = { name: 'azure', scorePronunciation };
    const controller = new PronunciationScoringController(provider);
    const audioBase64 = Buffer.from('raw-audio-bytes').toString('base64');

    const result = await controller.score({
      audio: audioBase64,
      referenceText: 'hola amigo',
      languageCode: 'es-ES',
    });

    expect(scorePronunciation).toHaveBeenCalledWith(
      Buffer.from('raw-audio-bytes'),
      'hola amigo',
      'es-ES',
    );
    expect(result).toEqual(scoreResult);
  });
});
