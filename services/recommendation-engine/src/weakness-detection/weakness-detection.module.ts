import { Module } from '@nestjs/common';

import { WeaknessDetectionService } from './weakness-detection.service.js';

@Module({
  providers: [WeaknessDetectionService],
  exports: [WeaknessDetectionService],
})
export class WeaknessDetectionModule {}
