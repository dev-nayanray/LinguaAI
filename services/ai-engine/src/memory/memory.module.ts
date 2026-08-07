import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { MemoryManagerService } from './memory-manager.service.js';

@Module({
  imports: [DatabaseModule, GatewayModule],
  providers: [MemoryManagerService],
  exports: [MemoryManagerService],
})
export class MemoryModule {}
