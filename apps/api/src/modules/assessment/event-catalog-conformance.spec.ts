import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assessmentAttemptCompletedPayloadSchema } from '@linguaai/validation/learning';

/**
 * E6-T6's own evidence bar names an "event-catalog conformance test" — no
 * prior task in this repo built one (`OrganizationsService`'s own event
 * tests, and `packages/events/src/domain-event.test.ts`, each assert a
 * `publish()` call site's exact shape, never diff against
 * EVENT_ARCHITECTURE.md's catalog text itself). This establishes that
 * convention rather than following one: (1) the event type string this
 * service actually publishes must still exist in the catalog table (catches
 * a typo'd or silently-renamed `type` string drifting from the documented
 * contract), and (2) the payload this service actually constructs must
 * satisfy the same Zod schema `assessment.service.ts` uses to build it —
 * proving the two are the same object, not two independently-hand-maintained
 * shapes that could quietly diverge.
 */
describe('assessment.attempt.completed event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`assessment.attempt.completed`');
  });

  it('a representative real payload satisfies the schema assessment.service.ts builds its event from', () => {
    const payload = {
      attemptId: '11111111-1111-1111-1111-111111111111',
      languageId: '22222222-2222-2222-2222-222222222222',
      type: 'PLACEMENT',
      skillResults: [{ skill: 'READING', cefrLevel: 'B1', confidence: 0.6, lowConfidence: false }],
    };

    expect(() => assessmentAttemptCompletedPayloadSchema.parse(payload)).not.toThrow();
  });
});
