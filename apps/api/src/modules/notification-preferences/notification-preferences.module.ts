import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { NotificationPreferencesController } from './notification-preferences.controller.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';

/**
 * `GET`/`PUT /v1/notification-preferences` (E16 T3). `AuthModule` is
 * imported only for `AuthGuard('jwt')`'s own strategy provider, the same
 * pattern every other learner-facing module already follows
 * (`UsersModule`'s own doc comment). `DomainEventPublisher` needs no
 * explicit import — `EventsModule` is `@Global()`.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService],
})
export class NotificationPreferencesModule {}
