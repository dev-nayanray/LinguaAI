import { UnprocessableEntityException } from '@nestjs/common';
import type { AssessmentItem } from '@linguaai/database';

import { scoreObjectiveResponse } from './objective-scoring.util.js';

type ItemFixture = Pick<AssessmentItem, 'itemType' | 'correctAnswer'>;

describe('scoreObjectiveResponse', () => {
  describe('MULTIPLE_CHOICE', () => {
    const item: ItemFixture = { itemType: 'MULTIPLE_CHOICE', correctAnswer: { correctIndex: 1 } };

    it('scores a matching selectedIndex as correct', () => {
      expect(scoreObjectiveResponse(item, { selectedIndex: 1 })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('scores a non-matching selectedIndex as incorrect', () => {
      expect(scoreObjectiveResponse(item, { selectedIndex: 0 })).toEqual({
        isCorrect: false,
        score: 0,
      });
    });

    it('throws UnprocessableEntityException when the response has no selectedIndex', () => {
      expect(() => scoreObjectiveResponse(item, { text: 'not a choice' })).toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('FILL_IN_BLANK', () => {
    const item: ItemFixture = {
      itemType: 'FILL_IN_BLANK',
      correctAnswer: { acceptable: ['soy', 'Soy'] },
    };

    it('scores an exact match as correct', () => {
      expect(scoreObjectiveResponse(item, { text: 'soy' })).toEqual({ isCorrect: true, score: 1 });
    });

    it('is case-insensitive and trims whitespace', () => {
      expect(scoreObjectiveResponse(item, { text: '  SOY  ' })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('scores a non-matching answer as incorrect', () => {
      expect(scoreObjectiveResponse(item, { text: 'eres' })).toEqual({
        isCorrect: false,
        score: 0,
      });
    });

    it('throws UnprocessableEntityException when the response has no text', () => {
      expect(() => scoreObjectiveResponse(item, { selectedIndex: 0 })).toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('OPEN_RESPONSE (WRITING)', () => {
    it('throws — never objectively scoreable, AI-scored by ai-engine (E6 T4/T5)', () => {
      const item: ItemFixture = { itemType: 'OPEN_RESPONSE', correctAnswer: null };
      expect(() => scoreObjectiveResponse(item, { text: 'a long essay' })).toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
