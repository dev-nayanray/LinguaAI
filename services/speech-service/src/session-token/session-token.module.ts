import { Module } from '@nestjs/common';

import { resolveSessionTokenConfig, SESSION_TOKEN_CONFIG } from './session-token.config.js';
import { SessionTokenService } from './session-token.service.js';

@Module({
  providers: [
    { provide: SESSION_TOKEN_CONFIG, useFactory: () => resolveSessionTokenConfig() },
    SessionTokenService,
  ],
  exports: [SessionTokenService],
})
export class SessionTokenModule {}
