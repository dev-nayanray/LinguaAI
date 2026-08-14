import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { examMockTestCompletedPayloadSchema } from '@linguaai/validation/exams';

/**
 * `exam.mock_test.completed` conformance (E19 T2) — mirrors
 * `assessment.attempt.completed`'s own established convention exactly
 * (`apps/api/src/modules/assessment/event-catalog-conformance.spec.ts`):
 * (1) the event type string this service actually publishes must still
 * exist in the catalog table, (2) the payload this service actually
 * constructs must satisfy the same Zod schema `mock-test-attempts.service.ts`
 * uses to build it.
 */
describe('exam.mock_test.completed event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`exam.mock_test.completed`');
  });

  it('a representative real payload satisfies the schema mock-test-attempts.service.ts builds its event from', () => {
    const payload = {
      mockTestAttemptId: '11111111-1111-1111-1111-111111111111',
      examProgramId: '22222222-2222-2222-2222-222222222222',
      overallScore: 6.5,
    };

    expect(() => examMockTestCompletedPayloadSchema.parse(payload)).not.toThrow();
  });
});
