import { Module } from '@nestjs/common';

import { ToolRegistryService } from './tool-registry.service.js';

@Module({
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class RegistryModule {}
