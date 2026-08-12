import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { pronunciationAttemptScoredPayloadSchema } from '@linguaai/validation/pronunciation';

/**
 * Same discipline `speaking/event-catalog-conformance.spec.ts` already
 * established (E10 T5): (1) the event type string this module actually
 * publishes must still exist in the catalog table, and (2) a representative
 * real payload must satisfy the same Zod schema `pronunciation-lab.service.ts`
 * uses to build it. `pronunciation.attempt.scored` is a brand-new row (no
 * prior placeholder existed), unlike `speech.session.ended`'s own refinement.
 */
describe('pronunciation.attempt.scored event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog, produced by apps/api (Pronunciation module)', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`pronunciation.attempt.scored`');
    expect(catalog).toContain('`apps/api` (Pronunciation module)');
  });

  it('a representative real payload satisfies the schema pronunciation-lab.service.ts builds its event from', () => {
    const payload = {
      attemptId: '11111111-1111-1111-1111-111111111111',
      languageId: '22222222-2222-2222-2222-222222222222',
      overallScore: 88,
      accuracyScore: 90,
      fluencyScore: 85,
      completenessScore: 95,
    };

    expect(() => pronunciationAttemptScoredPayloadSchema.parse(payload)).not.toThrow();
  });
});
