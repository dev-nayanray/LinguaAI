import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { DeviceTokensController } from './device-tokens.controller.js';
import { DeviceTokensService } from './device-tokens.service.js';

/**
 * `POST`/`DELETE /v1/notifications/device-tokens*` (E21 T4). `AuthModule`
 * is imported only for `AuthGuard('jwt')`'s own strategy provider, the
 * same pattern `NotificationPreferencesModule` already follows.
 */
@Module({
  imports: [AuthModule],
  controllers: [DeviceTokensController],
  providers: [DeviceTokensService],
})
export class DeviceTokensModule {}
