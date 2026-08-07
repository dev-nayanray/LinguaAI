import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { AI_ENGINE_REDIS } from '../redis/redis.module.js';
import {
  DEGRADE_THRESHOLD_PER_HOUR_USD_MICROS,
  DEGRADE_THRESHOLD_PER_MINUTE_USD_MICROS,
  HARD_STOP_THRESHOLD_PER_HOUR_USD_MICROS,
  HARD_STOP_THRESHOLD_PER_MINUTE_USD_MICROS,
  hourBucketKey,
  minuteBucketKey,
  type BreachState,
} from './circuit-breaker.constants.js';

/**
 * ADR-034 / AI_GOVERNANCE.md §5's 3-stage breach ladder, checked "before
 * each new AI-invoking request reaches the Router" — literally: the
 * caller (`OrchestratorService`) checks this before invoking
 * `RouterService`, not something built into the Router itself. Stage 3
 * ("page on-call immediately") is not a synchronous action this method
 * performs — it's an ERROR-level structured log on the HARD_STOP
 * transition, for OBSERVABILITY.md's own alerting pipeline to page from;
 * this service does not integrate a paging provider directly, and never
 * claims to.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private lastLoggedState: BreachState = 'NONE';

  constructor(@Inject(AI_ENGINE_REDIS) private readonly redis: Redis) {}

  async checkBreachState(): Promise<BreachState> {
    const now = new Date();
    const [minuteSpendRaw, hourSpendRaw] = await this.redis.mget(
      minuteBucketKey(now),
      hourBucketKey(now),
    );
    const minuteSpend = Number(minuteSpendRaw ?? 0);
    const hourSpend = Number(hourSpendRaw ?? 0);

    const state = this.resolveState(minuteSpend, hourSpend);
    this.logTransition(state, minuteSpend, hourSpend);
    return state;
  }

  private resolveState(minuteSpend: number, hourSpend: number): BreachState {
    if (
      minuteSpend >= HARD_STOP_THRESHOLD_PER_MINUTE_USD_MICROS ||
      hourSpend >= HARD_STOP_THRESHOLD_PER_HOUR_USD_MICROS
    ) {
      return 'HARD_STOP';
    }
    if (
      minuteSpend >= DEGRADE_THRESHOLD_PER_MINUTE_USD_MICROS ||
      hourSpend >= DEGRADE_THRESHOLD_PER_HOUR_USD_MICROS
    ) {
      return 'DEGRADE';
    }
    return 'NONE';
  }

  /** Logs only on a state transition, not on every check — a HARD_STOP that persists for an hour should page once, loudly, not flood the log/alert pipeline with a duplicate page per request. */
  private logTransition(state: BreachState, minuteSpend: number, hourSpend: number): void {
    if (state === this.lastLoggedState) {
      return;
    }
    this.lastLoggedState = state;
    const context = { minuteSpendUsdMicros: minuteSpend, hourSpendUsdMicros: hourSpend };
    if (state === 'HARD_STOP') {
      this.logger.error({
        message: 'AI cost circuit breaker: HARD_STOP — page on-call',
        ...context,
      });
    } else if (state === 'DEGRADE') {
      this.logger.warn({ message: 'AI cost circuit breaker: DEGRADE', ...context });
    } else {
      this.logger.log({ message: 'AI cost circuit breaker: recovered to NONE', ...context });
    }
  }
}
