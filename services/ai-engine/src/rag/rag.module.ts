import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { RagRetrievalService } from './rag-retrieval.service.js';

@Module({
  imports: [DatabaseModule, GatewayModule],
  providers: [RagRetrievalService],
  exports: [RagRetrievalService],
})
export class RagModule {}
