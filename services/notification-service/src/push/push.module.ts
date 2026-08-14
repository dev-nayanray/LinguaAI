import { Module } from '@nestjs/common';
import type { PushEnv } from '@linguaai/config';

import { PushClientService } from './push-client.service.js';
import { PUSH_CONFIG } from './push.constants.js';
import { resolvePushConfig } from './push.config.js';

@Module({
  providers: [
    { provide: PUSH_CONFIG, useFactory: (): PushEnv => resolvePushConfig() },
    PushClientService,
  ],
  exports: [PushClientService],
})
export class PushModule {}
