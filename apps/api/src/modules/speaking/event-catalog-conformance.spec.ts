import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { speakingSessionEndedPayloadSchema } from '@linguaai/validation/speaking';

/**
 * Same discipline `assessment/event-catalog-conformance.spec.ts` already
 * established (E6 T6): (1) the event type string this module actually
 * publishes must still exist in the catalog table, and (2) a representative
 * real payload must satisfy the same Zod schema `speaking.service.ts` uses
 * to build it. `speech.session.ended` is a pre-existing catalog row this
 * task *refined* (real producer/payload) rather than a brand-new one —
 * worth proving the refined row is still findable by name.
 */
describe('speech.session.ended event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog, with the producer corrected to apps/api', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`speech.session.ended`');
    expect(catalog).toContain('`apps/api` (Speaking module)');
  });

  it('a representative real payload (a scored session) satisfies the schema speaking.service.ts builds its event from', () => {
    const payload = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      languageId: '22222222-2222-2222-2222-222222222222',
      overallScore: 78,
      componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
      vocabularyExtractedCount: 2,
    };

    expect(() => speakingSessionEndedPayloadSchema.parse(payload)).not.toThrow();
  });

  it('a representative no-content-scored payload (null score) also satisfies the schema', () => {
    const payload = {
      sessionId: '11111111-1111-1111-1111-111111111111',
      languageId: '22222222-2222-2222-2222-222222222222',
      overallScore: null,
      componentScores: null,
      vocabularyExtractedCount: 0,
    };

    expect(() => speakingSessionEndedPayloadSchema.parse(payload)).not.toThrow();
  });
});
