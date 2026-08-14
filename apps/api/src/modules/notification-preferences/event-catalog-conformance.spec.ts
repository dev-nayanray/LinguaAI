import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { notificationPreferenceChangedPayloadSchema } from '@linguaai/validation/notification';

/**
 * `assessment.service.ts`'s own established convention
 * (`../assessment/event-catalog-conformance.spec.ts`), applied here to
 * `NotificationPreferencesService`'s own real, first-ever producer of
 * `notification.preference.changed` (E16 T3) — a row that existed as a
 * catalog placeholder since before this task.
 */
describe('notification.preference.changed event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`notification.preference.changed`');
  });

  it('a representative real payload satisfies the schema NotificationPreferencesService builds its event from', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      channel: 'EMAIL',
      type: 'MARKETING',
      enabled: false,
    };

    expect(() => notificationPreferenceChangedPayloadSchema.parse(payload)).not.toThrow();
  });
});
