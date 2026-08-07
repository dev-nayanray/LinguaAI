import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type Redis from 'ioredis';

import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { AI_ENGINE_REDIS } from '../redis/redis.module.js';
import {
  HOUR_BUCKET_TTL_SECONDS,
  MINUTE_BUCKET_TTL_SECONDS,
  hourBucketKey,
  minuteBucketKey,
} from './circuit-breaker.constants.js';
import { estimateCostUsdMicros } from './pricing-table.js';
import type { RecordUsageInput, RecordUsageResult } from './cost-meter.types.js';

/**
 * AI_SYSTEM.md §8: "Every AI request writes an AIUsageLog entry." ADR-034:
 * the Redis sliding-window counter `CircuitBreakerService` reads is
 * "incremented from every `AIUsageLog.costUsdMicros` write" — this
 * service is that write, and the one thing that increments the counter;
 * there is no second, separate increment path to keep in sync.
 */
@Injectable()
export class CostMeterService {
  constructor(
    @Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(AI_ENGINE_REDIS) private readonly redis: Redis,
  ) {}

  async recordUsage(input: RecordUsageInput): Promise<RecordUsageResult> {
    const costUsdMicros = estimateCostUsdMicros(
      input.modelId,
      input.inputTokens,
      input.outputTokens,
    );
    const now = new Date();

    await this.prisma.aIUsageLog.create({
      data: {
        userId: input.userId,
        agentPersona: input.agentPersona,
        modelId: input.modelId,
        promptVersion: input.promptVersion,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsdMicros,
        latencyMs: input.latencyMs,
      },
    });

    const minuteKey = minuteBucketKey(now);
    const hourKey = hourBucketKey(now);
    await this.redis
      .multi()
      .incrby(minuteKey, costUsdMicros)
      .expire(minuteKey, MINUTE_BUCKET_TTL_SECONDS)
      .incrby(hourKey, costUsdMicros)
      .expire(hourKey, HOUR_BUCKET_TTL_SECONDS)
      .exec();

    return { costUsdMicros };
  }
}
