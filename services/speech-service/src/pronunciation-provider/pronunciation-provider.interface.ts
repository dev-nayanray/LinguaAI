/**
 * The single interface every pronunciation-scoring provider is integrated
 * behind (AI_SYSTEM.md §1/§2, ADR-006: "No application code calls an
 * LLM/STT/TTS SDK directly" — extended here a second time, after
 * `SttProvider`/`TtsProvider`, to a third, deliberately separate speech
 * capability). E11 §3.1's own found gap: no STT/TTS provider anywhere in
 * this platform (ADR-043's OpenAI `whisper-1` included) can produce a
 * phoneme-level score against a known reference phrase — that is a
 * materially different capability, not an extension of transcription.
 *
 * Non-streaming, unlike `SttProvider.streamTranscribe` — a Pronunciation
 * Lab attempt (E11 §6.2) is one complete, bounded recording scored against
 * one known target phrase, not a live multi-turn stream.
 */

export interface PhonemeScore {
  phoneme: string;
  /** 0-100 — the provider's own accuracy score for this one phoneme. */
  accuracyScore: number;
}

export type WordErrorType = 'NONE' | 'MISPRONUNCIATION' | 'OMISSION' | 'INSERTION';

export interface WordScore {
  word: string;
  /** 0-100. */
  accuracyScore: number;
  errorType: WordErrorType;
  phonemes: PhonemeScore[];
}

export interface PronunciationScoreResult {
  /** 0-100 — the provider's own single top-level pronunciation score. */
  overallScore: number;
  /** 0-100 — how closely phonemes match a native speaker's pronunciation. */
  accuracyScore: number;
  /** 0-100 — naturalness of pacing/rhythm/stress. */
  fluencyScore: number;
  /** 0-100 — how much of the reference phrase was actually attempted. */
  completenessScore: number;
  words: WordScore[];
}

export interface PronunciationProvider {
  readonly name: 'azure';
  /**
   * @param audio Raw, complete audio bytes for one attempted utterance (not a chunked stream — E11 §6.1's own deliberate non-streaming shape).
   * @param referenceText The known target phrase the learner was asked to say.
   * @param languageCode A BCP-47 locale (e.g. `es-ES`) — the provider's own recognition/scoring language.
   */
  scorePronunciation(
    audio: Buffer,
    referenceText: string,
    languageCode: string,
  ): Promise<PronunciationScoreResult>;
}
