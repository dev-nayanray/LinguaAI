import { Module } from '@nestjs/common';

import { SafetyLayerService } from './safety-layer.service.js';

@Module({
  providers: [SafetyLayerService],
  exports: [SafetyLayerService],
})
export class SafetyModule {}
