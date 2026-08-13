import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  billingEntitlementChangedPayloadSchema,
  billingSubscriptionChangedPayloadSchema,
} from '@linguaai/validation/commerce';

/**
 * `event-catalog-conformance.spec.ts` convention (E6-T6, applied by
 * `course`/`assessment`/`speaking`/`pronunciation`) — applied here to
 * `BillingService`'s own two published events (E15 T1, design doc §6.2):
 * (1) the event type strings this service actually publishes must still
 * exist in the catalog table, and (2) a representative payload for each
 * satisfies the same schema the publisher constructs it from.
 */
describe('billing.subscription.changed / billing.entitlement.changed event conformance', () => {
  it('are both registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`billing.subscription.changed`');
    expect(catalog).toContain('`billing.entitlement.changed`');
  });

  it('a representative real payload satisfies the schema BillingService builds billing.subscription.changed from', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      plan: 'PREMIUM',
      status: 'ACTIVE',
    };

    expect(() => billingSubscriptionChangedPayloadSchema.parse(payload)).not.toThrow();
  });

  it('a representative real payload satisfies the schema BillingService builds billing.entitlement.changed from', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      entitlementKey: 'planTier',
      newValue: 'PREMIUM',
    };

    expect(() => billingEntitlementChangedPayloadSchema.parse(payload)).not.toThrow();
  });
});
