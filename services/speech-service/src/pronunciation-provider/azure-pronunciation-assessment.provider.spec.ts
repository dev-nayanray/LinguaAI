import { AzurePronunciationAssessmentProvider } from './azure-pronunciation-assessment.provider.js';

const mockPushStream = { write: jest.fn(), close: jest.fn() };
const mockAudioConfig = { fake: 'audio-config' };
const mockSpeechConfig = { speechRecognitionLanguage: '' };
const mockApplyTo = jest.fn();
let recognizeOnceAsyncImpl: (
  success: (result: unknown) => void,
  error: (err: unknown) => void,
) => void;
const mockClose = jest.fn();

jest.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: { fromSubscription: jest.fn(() => mockSpeechConfig) },
  AudioInputStream: { createPushStream: jest.fn(() => mockPushStream) },
  AudioConfig: { fromStreamInput: jest.fn(() => mockAudioConfig) },
  PronunciationAssessmentConfig: jest.fn().mockImplementation(() => ({ applyTo: mockApplyTo })),
  PronunciationAssessmentGradingSystem: { HundredMark: 'HundredMark' },
  PronunciationAssessmentGranularity: { Phoneme: 'Phoneme' },
  SpeechRecognizer: jest.fn().mockImplementation(() => ({
    recognizeOnceAsync: (success: (result: unknown) => void, error: (err: unknown) => void) =>
      recognizeOnceAsyncImpl(success, error),
    close: mockClose,
  })),
  ResultReason: { RecognizedSpeech: 3, NoMatch: 0 },
  PronunciationAssessmentResult: {
    fromResult: jest.fn(() => ({
      accuracyScore: 90,
      fluencyScore: 85,
      completenessScore: 95,
      pronunciationScore: 88,
    })),
  },
  PropertyId: { SpeechServiceResponse_JsonResult: 'SpeechServiceResponse_JsonResult' },
}));

function fakeRecognizedResult(detailedJson: unknown): unknown {
  return {
    reason: 3,
    properties: { getProperty: jest.fn(() => JSON.stringify(detailedJson)) },
  };
}

describe('AzurePronunciationAssessmentProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpeechConfig.speechRecognitionLanguage = '';
  });

  it('scores a real recognized result, mapping top-level scores and word/phoneme detail', async () => {
    const detailed = {
      NBest: [
        {
          Words: [
            {
              Word: 'hola',
              PronunciationAssessment: { AccuracyScore: 92, ErrorType: 'None' },
              Phonemes: [{ Phoneme: 'o', PronunciationAssessment: { AccuracyScore: 88 } }],
            },
            {
              Word: 'amigo',
              PronunciationAssessment: { AccuracyScore: 70, ErrorType: 'Mispronunciation' },
              Phonemes: [],
            },
          ],
        },
      ],
    };
    recognizeOnceAsyncImpl = (success) => success(fakeRecognizedResult(detailed));
    const provider = new AzurePronunciationAssessmentProvider('fake-key', 'eastus');

    const result = await provider.scorePronunciation(
      Buffer.from('audio-bytes'),
      'hola amigo',
      'es-ES',
    );

    expect(result).toEqual({
      overallScore: 88,
      accuracyScore: 90,
      fluencyScore: 85,
      completenessScore: 95,
      words: [
        {
          word: 'hola',
          accuracyScore: 92,
          errorType: 'NONE',
          phonemes: [{ phoneme: 'o', accuracyScore: 88 }],
        },
        {
          word: 'amigo',
          accuracyScore: 70,
          errorType: 'MISPRONUNCIATION',
          phonemes: [],
        },
      ],
    });
    expect(mockSpeechConfig.speechRecognitionLanguage).toBe('es-ES');
    expect(mockApplyTo).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('closes the recognizer even when recognition fails', async () => {
    recognizeOnceAsyncImpl = (_success, error) => error(new Error('network boom'));
    const provider = new AzurePronunciationAssessmentProvider('fake-key', 'eastus');

    await expect(
      provider.scorePronunciation(Buffer.from('audio-bytes'), 'hola', 'es-ES'),
    ).rejects.toThrow('network boom');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when recognition completes without RecognizedSpeech', async () => {
    recognizeOnceAsyncImpl = (success) =>
      success({ reason: 0, properties: { getProperty: jest.fn() } });
    const provider = new AzurePronunciationAssessmentProvider('fake-key', 'eastus');

    await expect(
      provider.scorePronunciation(Buffer.from('audio-bytes'), 'hola', 'es-ES'),
    ).rejects.toThrow('recognition did not succeed');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('defaults an unrecognized word error type to NONE', async () => {
    const detailed = {
      NBest: [
        {
          Words: [{ Word: 'hola', PronunciationAssessment: undefined, Phonemes: undefined }],
        },
      ],
    };
    recognizeOnceAsyncImpl = (success) => success(fakeRecognizedResult(detailed));
    const provider = new AzurePronunciationAssessmentProvider('fake-key', 'eastus');

    const result = await provider.scorePronunciation(Buffer.from('audio-bytes'), 'hola', 'es-ES');

    expect(result.words).toEqual([
      { word: 'hola', accuracyScore: 0, errorType: 'NONE', phonemes: [] },
    ]);
  });
});
