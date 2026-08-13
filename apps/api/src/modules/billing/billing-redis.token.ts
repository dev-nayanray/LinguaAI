/** DI token for `EntitlementCacheService`'s own dedicated `ioredis` connection (E15 T3) — defined here, not in `billing.module.ts`, so `entitlement-cache.service.ts` can `@Inject()` it without a module<->service circular import (the same `daily-goal.constants.ts`/`DOMAIN_EVENT_PUBLISHER` precedent). */
export const BILLING_REDIS = Symbol('BILLING_REDIS');
