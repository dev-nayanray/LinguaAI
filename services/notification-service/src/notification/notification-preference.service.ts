import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationType, PrismaClient } from '@linguaai/database';

import { NOTIFICATION_SERVICE_PRISMA_CLIENT } from '../database/database.config.js';

/**
 * Real `NotificationPreference` enforcement (E16 T2, design doc §3.4) — no
 * row for `(userId, channel, type)` means "never explicitly opted out,"
 * matching `NotificationPreference.optedIn`'s own `@default(true)`: a row
 * only exists once a user has ever touched their preferences. `SECURITY_ALERT`
 * (and the password-reset flow itself) never call this at all (§3.5's own
 * carve-out) — enforced by `NotificationDispatcher` not calling this method
 * for that type, not by a branch inside it, so the bypass is visible at the
 * call site, not buried in this service's own logic.
 */
@Injectable()
export class NotificationPreferenceService {
  constructor(@Inject(NOTIFICATION_SERVICE_PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async isOptedIn(
    userId: string,
    channel: NotificationChannel,
    type: NotificationType,
  ): Promise<boolean> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel_type: { userId, channel, type } },
    });
    return preference?.optedIn ?? true;
  }
}
