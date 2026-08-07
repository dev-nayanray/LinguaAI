import type { PrismaClient } from '@linguaai/database';
import type Redis from 'ioredis';

import { HOUR_BUCKET_TTL_SECONDS, MINUTE_BUCKET_TTL_SECONDS } from './circuit-breaker.constants.js';
import { CostMeterService } from './cost-meter.service.js';

function fakePrisma() {
  return {
    aIUsageLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  } as unknown as PrismaClient & { aIUsageLog: { create: jest.Mock } };
}

function fakeRedis() {
  const multiChain = {
    incrby: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  return {
    redis: { multi: jest.fn().mockReturnValue(multiChain) } as unknown as Redis,
    multiChain,
  };
}

describe('CostMeterService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T14:23:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes an AIUsageLog row with the pricing-table-derived cost', async () => {
    const prisma = fakePrisma();
    const { redis } = fakeRedis();
    const service = new CostMeterService(prisma, redis);

    const result = await service.recordUsage({
      userId: 'user-1',
      agentPersona: 'PERSONAL_LANGUAGE_TEACHER',
      modelId: 'claude-sonnet',
      inputTokens: 1_000_000,
      outputTokens: 0,
      latencyMs: 500,
    });

    expect(prisma.aIUsageLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        agentPersona: 'PERSONAL_LANGUAGE_TEACHER',
        modelId: 'claude-sonnet',
        promptVersion: undefined,
        inputTokens: 1_000_000,
        outputTokens: 0,
        costUsdMicros: 3_000_000,
        latencyMs: 500,
      },
    });
    expect(result).toEqual({ costUsdMicros: 3_000_000 });
  });

  it('increments both the minute and hour Redis buckets by the computed cost, with their respective TTLs', async () => {
    const prisma = fakePrisma();
    const { redis, multiChain } = fakeRedis();
    const service = new CostMeterService(prisma, redis);

    await service.recordUsage({
      agentPersona: 'PERSONAL_LANGUAGE_TEACHER',
      modelId: 'claude-sonnet',
      inputTokens: 1_000_000,
      outputTokens: 0,
      latencyMs: 500,
    });

    expect(multiChain.incrby).toHaveBeenNthCalledWith(
      1,
      'ai-cost:minute:2026-08-07T14:23',
      3_000_000,
    );
    expect(multiChain.expire).toHaveBeenNthCalledWith(
      1,
      'ai-cost:minute:2026-08-07T14:23',
      MINUTE_BUCKET_TTL_SECONDS,
    );
    expect(multiChain.incrby).toHaveBeenNthCalledWith(2, 'ai-cost:hour:2026-08-07T14', 3_000_000);
    expect(multiChain.expire).toHaveBeenNthCalledWith(
      2,
      'ai-cost:hour:2026-08-07T14',
      HOUR_BUCKET_TTL_SECONDS,
    );
    expect(multiChain.exec).toHaveBeenCalledTimes(1);
  });

  it('passes an explicit promptVersion through when supplied', async () => {
    const prisma = fakePrisma();
    const { redis } = fakeRedis();
    const service = new CostMeterService(prisma, redis);

    await service.recordUsage({
      agentPersona: 'GRAMMAR_COACH',
      modelId: 'claude-haiku',
      promptVersion: 'grammar-coach-v3',
      inputTokens: 10,
      outputTokens: 10,
      latencyMs: 100,
    });

    expect(prisma.aIUsageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ promptVersion: 'grammar-coach-v3' }),
      }),
    );
  });
});
