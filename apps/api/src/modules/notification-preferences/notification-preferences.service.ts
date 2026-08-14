import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import {
  notificationChannelSchema,
  notificationPreferenceChangedPayloadSchema,
  notificationTypeSchema,
  type NotificationPreference,
  type UpdateNotificationPreferenceRequest,
} from '@linguaai/validation/notification';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';

/**
 * `GET`/`PUT /v1/notification-preferences` (E16 T3, design doc §5). Runs
 * through `app_role` (`APP_PRISMA_CLIENT`) — `NotificationPreference`
 * carries no RLS policy at all (confirmed, `analytics.prisma`'s own header
 * comment: "not tenant-scoped... no RLS policy"), and this is a genuine
 * authenticated per-request read/write keyed by `userId` from a
 * JWT-verified `request.user` (never client-suppliable), the same
 * `UsersService.getCurrentUser`/`updateProfile` precedent — no reason to
 * reach for `SERVICE_ROLE_PRISMA_CLIENT`, which is reserved for genuinely
 * no-session paths (webhooks, background workers).
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Design doc §3.4 — a row only exists once a user has ever changed a
   * preference; no row for a `(channel, type)` pair means "never opted
   * out" (`optedIn` defaults to `true`). Synthesizes the full default set
   * for every real `(channel, type)` combination rather than only
   * returning whatever rows happen to already exist, or the caller
   * couldn't distinguish "never set" from "not shown."
   */
  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    const rows = await this.appPrisma.notificationPreference.findMany({ where: { userId } });
    const rowsByKey = new Map(rows.map((row) => [`${row.channel}:${row.type}`, row]));

    const result: NotificationPreference[] = [];
    for (const channel of notificationChannelSchema.options) {
      for (const type of notificationTypeSchema.options) {
        const row = rowsByKey.get(`${channel}:${type}`);
        result.push({ channel, type, optedIn: row?.optedIn ?? true });
      }
    }
    return result;
  }

  /**
   * `SECURITY_ALERT` is a valid enum value at the schema layer (so a
   * malformed request for any other reason still gets a real 400, not a
   * confusing 422) but is rejected here as a real business-rule violation
   * (422 `SEMANTIC_VALIDATION_ERROR`, API_GUIDELINES.md §3) —
   * `notification-service`'s own `NotificationDispatcher` never checks
   * `NotificationPreference` for this type at all (design doc §3.5's
   * security-critical carve-out), so silently accepting this write would
   * store a row that looks meaningful but is never actually honored,
   * misleading whatever UI renders this toggle.
   */
  async updatePreference(
    userId: string,
    dto: UpdateNotificationPreferenceRequest,
  ): Promise<NotificationPreference> {
    if (dto.type === 'SECURITY_ALERT') {
      throw new UnprocessableEntityException('SECURITY_ALERT notifications cannot be disabled');
    }

    const row = await this.appPrisma.notificationPreference.upsert({
      where: { userId_channel_type: { userId, channel: dto.channel, type: dto.type } },
      create: { userId, channel: dto.channel, type: dto.type, optedIn: dto.optedIn },
      update: { optedIn: dto.optedIn },
    });

    await this.events.publish('notification.preference.changed', {
      userId,
      payload: notificationPreferenceChangedPayloadSchema.parse({
        userId,
        channel: dto.channel,
        type: dto.type,
        enabled: dto.optedIn,
      }),
    });

    return { channel: row.channel, type: row.type, optedIn: row.optedIn };
  }
}
