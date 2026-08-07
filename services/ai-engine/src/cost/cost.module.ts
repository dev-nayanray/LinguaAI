import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { CostMeterService } from './cost-meter.service.js';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [CostMeterService, CircuitBreakerService],
  exports: [CostMeterService, CircuitBreakerService],
})
export class CostModule {}
