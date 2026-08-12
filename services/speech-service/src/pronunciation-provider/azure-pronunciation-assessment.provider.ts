import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

import type {
  PhonemeScore,
  PronunciationProvider,
  PronunciationScoreResult,
  WordErrorType,
  WordScore,
} from './pronunciation-provider.interface.js';

/**
 * Raw shape of Azure's own detailed JSON pronunciation-assessment result
 * (`SpeechServiceResponse_JsonResult`, undocumented as a typed SDK object —
 * the SDK's own convenience getters (`PronunciationAssessmentResult`) only
 * expose the four top-level scores, not word/phoneme detail, which is only
 * available by parsing this raw JSON property). Typed narrowly to what
 * this provider actually reads, not the full documented response shape.
 */
interface AzureDetailedResult {
  NBest?: Array<{
    Words?: Array<{
      Word: string;
      PronunciationAssessment?: {
        AccuracyScore: number;
        ErrorType: string;
      };
      Phonemes?: Array<{
        Phoneme: string;
        PronunciationAssessment?: { AccuracyScore: number };
      }>;
    }>;
  }>;
}

const WORD_ERROR_TYPES: readonly WordErrorType[] = [
  'NONE',
  'MISPRONUNCIATION',
  'OMISSION',
  'INSERTION',
];

function toWordErrorType(raw: string | undefined): WordErrorType {
  const match = WORD_ERROR_TYPES.find((candidate) => candidate === raw?.toUpperCase());
  return match ?? 'NONE';
}

function parseWordScores(detailed: AzureDetailedResult): WordScore[] {
  const words = detailed.NBest?.[0]?.Words ?? [];
  return words.map((word) => {
    const phonemes: PhonemeScore[] = (word.Phonemes ?? []).map((phoneme) => ({
      phoneme: phoneme.Phoneme,
      accuracyScore: phoneme.PronunciationAssessment?.AccuracyScore ?? 0,
    }));
    return {
      word: word.Word,
      accuracyScore: word.PronunciationAssessment?.AccuracyScore ?? 0,
      errorType: toWordErrorType(word.PronunciationAssessment?.ErrorType),
      phonemes,
    };
  });
}

/**
 * ADR-049's own pinned provider — the one commercially-available API
 * purpose-built for reference-text-anchored phoneme/word-level
 * pronunciation scoring (E11 §3.1/§6.1/§7); OpenAI's `whisper-1`
 * (ADR-043) is transcription-only and cannot produce this. `AZURE_SPEECH_KEY`/
 * `AZURE_SPEECH_REGION` are this provider's real, first-ever consumer
 * (removed as dead scaffolding at E10 T1, reintroduced for real here).
 *
 * The SDK's own recognition API is callback-based (`recognizeOnceAsync`),
 * wrapped here in a `Promise` — the same "adapt a callback SDK to this
 * platform's async/await-everywhere convention" pattern `S3AudioStorageProvider`
 * (E10 T4) and `OpenAiSpeechProvider`'s own stream-reading loop already
 * established, each in their own SDK's idiom.
 */
export class AzurePronunciationAssessmentProvider implements PronunciationProvider {
  readonly name = 'azure' as const;

  constructor(
    private readonly speechKey: string,
    private readonly speechRegion: string,
  ) {}

  async scorePronunciation(
    audio: Buffer,
    referenceText: string,
    languageCode: string,
  ): Promise<PronunciationScoreResult> {
    const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
    speechConfig.speechRecognitionLanguage = languageCode;

    const pushStream = sdk.AudioInputStream.createPushStream();
    // `Buffer` is a `Uint8Array` view, not itself an `ArrayBuffer` -- the
    // SDK's own `write()` requires a real `ArrayBuffer`, so the backing
    // bytes are copied out via `.slice()` (safe regardless of whether this
    // `Buffer` is a view into a larger, shared underlying pool).
    const arrayBuffer = audio.buffer.slice(
      audio.byteOffset,
      audio.byteOffset + audio.byteLength,
    ) as ArrayBuffer;
    pushStream.write(arrayBuffer);
    pushStream.close();
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true,
    );

    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationAssessmentConfig.applyTo(recognizer);

    try {
      const result = await this.recognizeOnce(recognizer);

      if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
        throw new Error(
          `AzurePronunciationAssessmentProvider: recognition did not succeed (reason: ${sdk.ResultReason[result.reason]})`,
        );
      }

      const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
      const rawJson = result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult,
      );
      const detailed = JSON.parse(rawJson) as AzureDetailedResult;

      return {
        overallScore: assessment.pronunciationScore,
        accuracyScore: assessment.accuracyScore,
        fluencyScore: assessment.fluencyScore,
        completenessScore: assessment.completenessScore,
        words: parseWordScores(detailed),
      };
    } finally {
      recognizer.close();
    }
  }

  private recognizeOnce(recognizer: sdk.SpeechRecognizer): Promise<sdk.SpeechRecognitionResult> {
    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => resolve(result),
        (error) => reject(new Error(`AzurePronunciationAssessmentProvider: ${error}`)),
      );
    });
  }
}
