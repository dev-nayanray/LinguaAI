import { evaluateTrigger } from './trigger-evaluator.js';
import type { TriggerCondition } from './tool-registry.types.js';

describe('evaluateTrigger', () => {
  describe('error_pattern_threshold', () => {
    const condition: TriggerCondition = {
      type: 'error_pattern_threshold',
      confidenceThreshold: 0.7,
      minRecurrenceCount: 3,
    };

    it('fires when both the recurrence count and confidence meet the threshold', () => {
      expect(
        evaluateTrigger(condition, {
          type: 'error_pattern_threshold',
          patternRecurrenceCount: 3,
          confidence: 0.7,
        }),
      ).toBe(true);
    });

    it('does not fire when the recurrence count is below the threshold', () => {
      expect(
        evaluateTrigger(condition, {
          type: 'error_pattern_threshold',
          patternRecurrenceCount: 2,
          confidence: 0.9,
        }),
      ).toBe(false);
    });

    it('does not fire when the confidence is below the threshold', () => {
      expect(
        evaluateTrigger(condition, {
          type: 'error_pattern_threshold',
          patternRecurrenceCount: 5,
          confidence: 0.5,
        }),
      ).toBe(false);
    });
  });

  describe('phoneme_score_threshold', () => {
    const condition: TriggerCondition = {
      type: 'phoneme_score_threshold',
      confidenceThreshold: 0.6,
    };

    it('fires when the confidence meets the threshold', () => {
      expect(evaluateTrigger(condition, { type: 'phoneme_score_threshold', confidence: 0.6 })).toBe(
        true,
      );
    });

    it('does not fire when the confidence is below the threshold', () => {
      expect(evaluateTrigger(condition, { type: 'phoneme_score_threshold', confidence: 0.1 })).toBe(
        false,
      );
    });
  });

  it('throws a clear error on a signal/condition type mismatch, rather than silently returning false', () => {
    const condition: TriggerCondition = {
      type: 'phoneme_score_threshold',
      confidenceThreshold: 0.6,
    };

    expect(() =>
      evaluateTrigger(condition, {
        type: 'error_pattern_threshold',
        patternRecurrenceCount: 3,
        confidence: 0.9,
      }),
    ).toThrow(
      'Trigger condition type "phoneme_score_threshold" does not match signal type "error_pattern_threshold"',
    );
  });
});
