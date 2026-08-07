import type { TriggerCondition } from './tool-registry.types.js';

/**
 * What producing these signals actually requires (a real grammar-error
 * pattern classifier; real phoneme-scoring data from `speech-service`,
 * E10) is each specialist's own pedagogical logic — explicitly each
 * consuming epic's own scope (E5 §1: "the remaining five personas'
 * specific tool logic... are named in scope structurally... but their
 * real pedagogical logic is each consuming epic's own scope"). T5 builds
 * only the decision mechanism: given a signal, does the registered
 * trigger condition fire.
 */
export interface ErrorPatternSignal {
  type: 'error_pattern_threshold';
  patternRecurrenceCount: number;
  confidence: number;
}

export interface PhonemeScoreSignal {
  type: 'phoneme_score_threshold';
  confidence: number;
}

export type TriggerSignal = ErrorPatternSignal | PhonemeScoreSignal;

/** Fails closed on a signal/condition type mismatch rather than silently returning false — that would look identical to "the trigger correctly did not fire," hiding a real caller bug. */
export function evaluateTrigger(condition: TriggerCondition, signal: TriggerSignal): boolean {
  if (condition.type !== signal.type) {
    throw new Error(
      `Trigger condition type "${condition.type}" does not match signal type "${signal.type}"`,
    );
  }

  switch (condition.type) {
    case 'error_pattern_threshold': {
      const errorSignal = signal as ErrorPatternSignal;
      return (
        errorSignal.patternRecurrenceCount >= condition.minRecurrenceCount &&
        errorSignal.confidence >= condition.confidenceThreshold
      );
    }
    case 'phoneme_score_threshold': {
      const phonemeSignal = signal as PhonemeScoreSignal;
      return phonemeSignal.confidence >= condition.confidenceThreshold;
    }
  }
}
