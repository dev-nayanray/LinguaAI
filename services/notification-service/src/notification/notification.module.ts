import { Module } from '@nestjs/common';
import { loadConfig, serverUrlEnvSchema, type ServerUrlEnv } from '@linguaai/config';

import { EmailModule } from '../email/email.module.js';
import { NOTIFICATION_SERVER_URL_CONFIG } from './notification.constants.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { NotificationPreferenceService } from './notification-preference.service.js';

/**
 * The real domain module behind `DomainEventsModule`'s own `Worker` (E16
 * T2) — holds `NotificationDispatcher`'s actual dispatch/preference/
 * delivery/logging logic, imported into `DomainEventsModule` the same way
 * `recommendation-engine`'s own `DomainEventsModule` imports
 * `LearningPlanModule` for its own real logic.
 */
@Module({
  imports: [EmailModule],
  providers: [
    {
      provide: NOTIFICATION_SERVER_URL_CONFIG,
      useFactory: (): ServerUrlEnv => loadConfig(serverUrlEnvSchema),
    },
    NotificationPreferenceService,
    NotificationDispatcher,
  ],
  exports: [NotificationDispatcher],
})
export class NotificationModule {}
