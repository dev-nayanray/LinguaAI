import type { SpeechServiceClientEnv } from '@linguaai/config';

import { SpeechServiceClientService } from './speech-service-client.service.js';

const config: SpeechServiceClientEnv = {
  SPEECH_SERVICE_URL: 'http://speech-service.internal:4002',
};

function fakeFetch(): jest.MockedFunction<typeof fetch> {
  return jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
}

describe('SpeechServiceClientService', () => {
  describe('scorePronunciation', () => {
    it('POSTs the validated request body and returns the parsed score result', async () => {
      const responseBody = {
        overallScore: 88,
        accuracyScore: 90,
        fluencyScore: 85,
        completenessScore: 95,
        words: [{ word: 'hola', accuracyScore: 90, errorType: 'NONE', phonemes: [] }],
      };
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseBody),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new SpeechServiceClientService(config);

      const result = await client.scorePronunciation('YXVkaW8=', 'hola', 'es-ES');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://speech-service.internal:4002/v1/pronunciation/score',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: 'YXVkaW8=', referenceText: 'hola', languageCode: 'es-ES' }),
        },
      );
      expect(result).toEqual(responseBody);
    });

    it('throws a clear error when speech-service responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new SpeechServiceClientService(config);

      await expect(client.scorePronunciation('YXVkaW8=', 'hola', 'es-ES')).rejects.toThrow(
        'speech-service returned 500 scoring a pronunciation attempt',
      );
    });
  });

  describe('synthesizeSpeech', () => {
    it('POSTs the validated text and returns the real, already-uploaded audioUrl', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ audioUrl: 'https://storage.example.com/x.mp3' }),
      } as unknown as Response);
      global.fetch = fetchMock;
      const client = new SpeechServiceClientService(config);

      const result = await client.synthesizeSpeech('hola amigo');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://speech-service.internal:4002/v1/speech/synthesize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hola amigo' }),
        },
      );
      expect(result).toBe('https://storage.example.com/x.mp3');
    });

    it('throws a clear error when speech-service responds with a non-2xx status', async () => {
      const fetchMock = fakeFetch();
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      global.fetch = fetchMock;
      const client = new SpeechServiceClientService(config);

      await expect(client.synthesizeSpeech('hola')).rejects.toThrow(
        'speech-service returned 500 synthesizing speech',
      );
    });
  });
});
