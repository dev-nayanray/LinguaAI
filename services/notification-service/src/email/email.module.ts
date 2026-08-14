import { Module } from '@nestjs/common';
import type { EmailEnv } from '@linguaai/config';

import { EmailClientService } from './email-client.service.js';
import { EMAIL_CONFIG } from './email.constants.js';
import { resolveEmailConfig } from './email.config.js';

@Module({
  providers: [
    { provide: EMAIL_CONFIG, useFactory: (): EmailEnv => resolveEmailConfig() },
    EmailClientService,
  ],
  exports: [EmailClientService],
})
export class EmailModule {}
