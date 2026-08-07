import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { recommendationDailyGoalReadyPayloadSchema } from '@linguaai/validation/learning';

import { DAILY_GOAL_READY_EVENT_TYPE } from './daily-goal.constants.js';

/**
 * E6-T6's own established convention (`apps/api/src/modules/assessment/event-catalog-conformance.spec.ts`),
 * applied here to `recommendation-engine`'s own first published event: (1)
 * the event type string `DailyGoalService` actually publishes must still
 * exist in the catalog table (catches a typo'd or silently-renamed `type`
 * drifting from the documented contract), and (2) a representative payload
 * satisfies the same Zod schema the publisher constructs it from.
 */
describe('recommendation.daily_goal.ready event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`recommendation.daily_goal.ready`');
    expect(DAILY_GOAL_READY_EVENT_TYPE).toBe('recommendation.daily_goal.ready');
  });

  it('a representative real payload satisfies the schema DailyGoalService builds its event from', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      date: '2026-06-16',
      targetXp: 50,
      targetMinutes: 15,
      targetActivities: 3,
    };

    expect(() => recommendationDailyGoalReadyPayloadSchema.parse(payload)).not.toThrow();
  });
});
