import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  learningExerciseAnsweredPayloadSchema,
  learningLessonCompletedPayloadSchema,
} from '@linguaai/validation/learning';

/**
 * E6-T6's own established convention (`apps/api/src/modules/assessment/event-catalog-conformance.spec.ts`),
 * applied here to `ExerciseAttemptsService`'s own two published events
 * (E8 T3, §6.3) — both already existed in the catalog with no real
 * producer until this task (§3.2 of the design doc): (1) the event type
 * strings this service actually publishes must still exist in the catalog
 * table, and (2) a representative payload for each satisfies the same
 * schema the publisher constructs it from.
 */
describe('learning.exercise.answered / learning.lesson.completed event conformance', () => {
  it('are both registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`learning.exercise.answered`');
    expect(catalog).toContain('`learning.lesson.completed`');
  });

  it('a representative real payload satisfies the schema ExerciseAttemptsService builds learning.exercise.answered from', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      exerciseId: '22222222-2222-2222-2222-222222222222',
      correct: true,
    };

    expect(() => learningExerciseAnsweredPayloadSchema.parse(payload)).not.toThrow();
  });

  it('a representative real payload satisfies the schema ExerciseAttemptsService builds learning.lesson.completed from', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      lessonId: '33333333-3333-3333-3333-333333333333',
      score: 0.75,
    };

    expect(() => learningLessonCompletedPayloadSchema.parse(payload)).not.toThrow();
  });
});
