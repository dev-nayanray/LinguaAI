import { UnprocessableEntityException } from '@nestjs/common';

import { scoreExerciseResponse } from './exercise-scoring.util.js';

describe('scoreExerciseResponse', () => {
  describe('MULTIPLE_CHOICE', () => {
    it('is correct when selectedIndex matches correctIndex', () => {
      const result = scoreExerciseResponse(
        { type: 'MULTIPLE_CHOICE', correctAnswer: { correctIndex: 2 } },
        { selectedIndex: 2 },
      );
      expect(result).toEqual({ isCorrect: true, score: 1 });
    });

    it('is incorrect on a mismatch', () => {
      const result = scoreExerciseResponse(
        { type: 'MULTIPLE_CHOICE', correctAnswer: { correctIndex: 2 } },
        { selectedIndex: 0 },
      );
      expect(result).toEqual({ isCorrect: false, score: 0 });
    });

    it('throws 422 when the response is not shaped { selectedIndex }', () => {
      expect(() =>
        scoreExerciseResponse(
          { type: 'MULTIPLE_CHOICE', correctAnswer: { correctIndex: 0 } },
          { text: 'wrong shape' },
        ),
      ).toThrow(UnprocessableEntityException);
    });
  });

  describe('LISTENING_COMPREHENSION', () => {
    it('scores identically to MULTIPLE_CHOICE', () => {
      const result = scoreExerciseResponse(
        { type: 'LISTENING_COMPREHENSION', correctAnswer: { correctIndex: 1 } },
        { selectedIndex: 1 },
      );
      expect(result).toEqual({ isCorrect: true, score: 1 });
    });
  });

  describe('FILL_BLANK', () => {
    it('matches case-insensitively and trims whitespace', () => {
      const result = scoreExerciseResponse(
        { type: 'FILL_BLANK', correctAnswer: { acceptable: ['Hola'] } },
        { text: '  hola  ' },
      );
      expect(result).toEqual({ isCorrect: true, score: 1 });
    });

    it('is incorrect when the text matches none of the acceptable answers', () => {
      const result = scoreExerciseResponse(
        { type: 'FILL_BLANK', correctAnswer: { acceptable: ['Hola'] } },
        { text: 'Adios' },
      );
      expect(result).toEqual({ isCorrect: false, score: 0 });
    });

    it('throws 422 when the response is not shaped { text }', () => {
      expect(() =>
        scoreExerciseResponse(
          { type: 'FILL_BLANK', correctAnswer: { acceptable: ['Hola'] } },
          { selectedIndex: 0 },
        ),
      ).toThrow(UnprocessableEntityException);
    });
  });

  describe('TRANSLATION', () => {
    it('scores identically to FILL_BLANK', () => {
      const result = scoreExerciseResponse(
        { type: 'TRANSLATION', correctAnswer: { acceptable: ['Hello', 'Hi'] } },
        { text: 'hi' },
      );
      expect(result).toEqual({ isCorrect: true, score: 1 });
    });
  });

  describe('MATCHING', () => {
    const correctAnswer = {
      pairs: [
        { left: 'Hola', right: 'Hello' },
        { left: 'Adios', right: 'Goodbye' },
      ],
    };

    it('is correct when every pair matches, regardless of order', () => {
      const result = scoreExerciseResponse(
        { type: 'MATCHING', correctAnswer },
        {
          matches: [
            { left: 'Adios', right: 'Goodbye' },
            { left: 'Hola', right: 'Hello' },
          ],
        },
      );
      expect(result).toEqual({ isCorrect: true, score: 1 });
    });

    it('is incorrect when one pair is wrong', () => {
      const result = scoreExerciseResponse(
        { type: 'MATCHING', correctAnswer },
        {
          matches: [
            { left: 'Hola', right: 'Hello' },
            { left: 'Adios', right: 'Hello' },
          ],
        },
      );
      expect(result).toEqual({ isCorrect: false, score: 0 });
    });

    it('is incorrect when the count of matches differs from the correct pair count', () => {
      const result = scoreExerciseResponse(
        { type: 'MATCHING', correctAnswer },
        { matches: [{ left: 'Hola', right: 'Hello' }] },
      );
      expect(result).toEqual({ isCorrect: false, score: 0 });
    });

    it('throws 422 when the response is not shaped { matches }', () => {
      expect(() =>
        scoreExerciseResponse({ type: 'MATCHING', correctAnswer }, { text: 'wrong shape' }),
      ).toThrow(UnprocessableEntityException);
    });
  });

  describe('SPEAKING_PROMPT', () => {
    it("throws 422 — out of this epic's own scope until services/speech-service (E10)", () => {
      expect(() =>
        scoreExerciseResponse(
          { type: 'SPEAKING_PROMPT', correctAnswer: null },
          { text: 'some transcript' },
        ),
      ).toThrow(UnprocessableEntityException);
    });
  });
});
