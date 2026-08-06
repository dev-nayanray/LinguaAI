import { Module } from '@nestjs/common';

import { PromptManagerService } from './prompt-manager.service.js';

@Module({
  providers: [PromptManagerService],
  exports: [PromptManagerService],
})
export class PromptModule {}
