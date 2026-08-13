import type { BillingStatusResponse } from '@linguaai/validation/commerce';

import { EntitlementCacheService } from './entitlement-cache.service.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATUS: BillingStatusResponse = {
  planTier: 'PREMIUM',
  subscriptionStatus: 'ACTIVE',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  trialEndsAt: null,
  limits: { pronunciationLabAccess: true },
  usage: {},
};

function fakeRedis() {
  return { get: jest.fn(), set: jest.fn(), del: jest.fn() };
}

function fakeLogger() {
  return { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

describe('EntitlementCacheService', () => {
  it('returns null on a real cache miss', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(null);
    const cache = new EntitlementCacheService(redis as never, fakeLogger() as never);

    expect(await cache.get(USER_ID)).toBeNull();
  });

  it('returns the real, previously-cached status on a hit', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(JSON.stringify(STATUS));
    const cache = new EntitlementCacheService(redis as never, fakeLogger() as never);

    expect(await cache.get(USER_ID)).toEqual(STATUS);
  });

  it('set() writes with a real TTL (EX 60)', async () => {
    const redis = fakeRedis();
    const cache = new EntitlementCacheService(redis as never, fakeLogger() as never);

    await cache.set(USER_ID, STATUS);

    expect(redis.set).toHaveBeenCalledWith(
      `billing:entitlement:${USER_ID}`,
      JSON.stringify(STATUS),
      'EX',
      60,
    );
  });

  it('invalidate() deletes the real cache key', async () => {
    const redis = fakeRedis();
    const cache = new EntitlementCacheService(redis as never, fakeLogger() as never);

    await cache.invalidate(USER_ID);

    expect(redis.del).toHaveBeenCalledWith(`billing:entitlement:${USER_ID}`);
  });

  it('is fail-open on a Redis read error -- returns null, never throws', async () => {
    const redis = fakeRedis();
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const logger = fakeLogger();
    const cache = new EntitlementCacheService(redis as never, logger as never);

    await expect(cache.get(USER_ID)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('is fail-open on a Redis write error -- resolves, never throws', async () => {
    const redis = fakeRedis();
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const cache = new EntitlementCacheService(redis as never, fakeLogger() as never);

    await expect(cache.set(USER_ID, STATUS)).resolves.toBeUndefined();
  });

  it('is fail-open on a Redis invalidation error -- resolves, never throws', async () => {
    const redis = fakeRedis();
    redis.del.mockRejectedValue(new Error('ECONNREFUSED'));
    const cache = new EntitlementCacheService(redis as never, fakeLogger() as never);

    await expect(cache.invalidate(USER_ID)).resolves.toBeUndefined();
  });
});
