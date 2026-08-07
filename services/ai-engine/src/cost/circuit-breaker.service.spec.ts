import type Redis from 'ioredis';

import {
  DEGRADE_THRESHOLD_PER_HOUR_USD_MICROS,
  DEGRADE_THRESHOLD_PER_MINUTE_USD_MICROS,
  HARD_STOP_THRESHOLD_PER_MINUTE_USD_MICROS,
} from './circuit-breaker.constants.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';

function fakeRedis(mgetResult: [string | null, string | null]) {
  return { mget: jest.fn().mockResolvedValue(mgetResult) } as unknown as Redis;
}

describe('CircuitBreakerService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T14:23:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns NONE when spend is well under both thresholds', async () => {
    const redis = fakeRedis(['1000', '5000']);
    const service = new CircuitBreakerService(redis);

    await expect(service.checkBreachState()).resolves.toBe('NONE');
  });

  it('treats a missing bucket key (no spend recorded yet) as zero, not an error', async () => {
    const redis = fakeRedis([null, null]);
    const service = new CircuitBreakerService(redis);

    await expect(service.checkBreachState()).resolves.toBe('NONE');
  });

  it('returns DEGRADE once the per-minute degrade threshold is reached', async () => {
    const redis = fakeRedis([String(DEGRADE_THRESHOLD_PER_MINUTE_USD_MICROS), '0']);
    const service = new CircuitBreakerService(redis);

    await expect(service.checkBreachState()).resolves.toBe('DEGRADE');
  });

  it('returns DEGRADE once the per-hour degrade threshold is reached, even if the minute spend is low', async () => {
    const redis = fakeRedis(['0', String(DEGRADE_THRESHOLD_PER_HOUR_USD_MICROS)]);
    const service = new CircuitBreakerService(redis);

    await expect(service.checkBreachState()).resolves.toBe('DEGRADE');
  });

  it('returns HARD_STOP once the per-minute hard-stop threshold is reached, even though it also exceeds DEGRADE', async () => {
    const redis = fakeRedis([String(HARD_STOP_THRESHOLD_PER_MINUTE_USD_MICROS), '0']);
    const service = new CircuitBreakerService(redis);

    await expect(service.checkBreachState()).resolves.toBe('HARD_STOP');
  });

  it('reads the current minute and hour bucket keys derived from the real clock', async () => {
    const redis = fakeRedis(['0', '0']);
    const service = new CircuitBreakerService(redis);

    await service.checkBreachState();

    expect(redis.mget).toHaveBeenCalledWith(
      'ai-cost:minute:2026-08-07T14:23',
      'ai-cost:hour:2026-08-07T14',
    );
  });

  it('logs only on a state transition, not on every repeated check at the same state', async () => {
    const redis = fakeRedis(['0', '0']);
    const service = new CircuitBreakerService(redis);
    const errorSpy = jest.spyOn(
      (service as unknown as { logger: { error: jest.Mock } }).logger,
      'error',
    );

    await service.checkBreachState(); // NONE -> NONE, no transition
    await service.checkBreachState(); // still NONE, no transition

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs at ERROR level exactly once on transition into HARD_STOP, then stays silent on a repeated HARD_STOP check', async () => {
    const redis = fakeRedis([String(HARD_STOP_THRESHOLD_PER_MINUTE_USD_MICROS), '0']);
    const service = new CircuitBreakerService(redis);
    const errorSpy = jest.spyOn(
      (service as unknown as { logger: { error: jest.Mock } }).logger,
      'error',
    );

    await service.checkBreachState();
    await service.checkBreachState();

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('logs a recovery message when spend drops back down from DEGRADE to NONE', async () => {
    const redis = fakeRedis([String(DEGRADE_THRESHOLD_PER_MINUTE_USD_MICROS), '0']);
    const service = new CircuitBreakerService(redis);
    const logSpy = jest.spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log');

    await service.checkBreachState(); // NONE -> DEGRADE
    (redis.mget as jest.Mock).mockResolvedValue(['0', '0']);
    await service.checkBreachState(); // DEGRADE -> NONE

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
