import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerUrlEnv } from '@linguaai/config';
import type { PrismaClient } from '@linguaai/database';
import type { DomainEvent } from '@linguaai/events';
import {
  identityPasswordResetRequestedPayloadSchema,
  identityUserRegisteredPayloadSchema,
} from '@linguaai/validation/identity';

import { NOTIFICATION_SERVICE_PRISMA_CLIENT } from '../database/database.config.js';
import { EmailClientService } from '../email/email-client.service.js';
import { NOTIFICATION_SERVER_URL_CONFIG } from './notification.constants.js';
import { NotificationPreferenceService } from './notification-preference.service.js';
import { renderPasswordResetEmail } from './templates/password-reset-email.template.js';
import { renderWelcomeEmail } from './templates/welcome-email.template.js';

/**
 * The real dispatch logic behind `DomainEventsModule`'s own `Worker`
 * callback (E16 T2, design doc §6.2) — structurally mirrors
 * `recommendation-engine`'s own `DomainEventDispatcher` exactly: switches
 * on `jobName` (the event's own `type`), Zod-validates the payload against
 * the same `@linguaai/validation` schema the producer built it from, and
 * every event type this consumer doesn't yet care about is a real no-op
 * (this service's own `Worker` sees every event on its own fan-out queue
 * regardless of relevance — `EVENT_ARCHITECTURE.md`'s own catalog names
 * ~11 events for this consumer; only 2 are wired end-to-end at T2, §1's
 * own explicitly-scoped MVP slice, not an oversight).
 *
 * `*.module.ts` files are exempt from this repo's coverage requirement —
 * this class holds the real, tested behavior instead, matching
 * `DomainEventDispatcher`'s own precedent for why it's a plain
 * `@Injectable()`, not inlined into the module.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    @Inject(NOTIFICATION_SERVICE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(NOTIFICATION_SERVER_URL_CONFIG) private readonly serverUrlConfig: ServerUrlEnv,
    private readonly preferences: NotificationPreferenceService,
    private readonly emailClient: EmailClientService,
  ) {}

  async dispatch(jobName: string, event: DomainEvent): Promise<void> {
    if (jobName === 'identity.user.registered') {
      await this.handleUserRegistered(event);
      return;
    }
    if (jobName === 'identity.password.reset_requested') {
      await this.handlePasswordResetRequested(event);
      return;
    }
    // Every other cataloged event (§1's own out-of-scope list) — a real,
    // deliberate no-op, not a missing case.
  }

  private async handleUserRegistered(event: DomainEvent): Promise<void> {
    if (!event.userId) {
      this.logger.warn(`identity.user.registered event ${event.eventId} has no userId — skipping`);
      return;
    }
    // Validated for conformance with the producer's own schema (E16 T2) —
    // `signupSource` isn't used in the welcome email itself today, but a
    // malformed payload is still a real, thrown error here, never silently
    // skipped, the same discipline `DomainEventDispatcher`'s own doc
    // comment establishes for `assessment.attempt.completed`.
    identityUserRegisteredPayloadSchema.parse(event.payload);

    const user = await this.prisma.user.findUnique({ where: { id: event.userId } });
    if (!user) {
      this.logger.warn(
        `identity.user.registered event ${event.eventId}: no User row for userId ${event.userId} — skipping`,
      );
      return;
    }

    // §3.4 — SYSTEM is not a security-critical carve-out (§3.5), so it
    // respects NotificationPreference like any other ordinary notification.
    // `NotificationLog` is a delivery-*attempt* record (§3.3's own schema
    // reasoning) — a suppressed send is never attempted, so no row is
    // written for it, the same way a request a middleware rejects before
    // it reaches a handler never produces that handler's own log line.
    const optedIn = await this.preferences.isOptedIn(user.id, 'EMAIL', 'SYSTEM');
    if (!optedIn) {
      this.logger.log(
        `identity.user.registered: user ${user.id} opted out of SYSTEM/EMAIL — suppressed`,
      );
      return;
    }

    const content = renderWelcomeEmail(user.displayName);
    await this.sendAndLog(user.id, user.email, 'SYSTEM', content);
  }

  private async handlePasswordResetRequested(event: DomainEvent): Promise<void> {
    if (!event.userId) {
      this.logger.warn(
        `identity.password.reset_requested event ${event.eventId} has no userId — skipping`,
      );
      return;
    }
    const payload = identityPasswordResetRequestedPayloadSchema.parse(event.payload);

    const user = await this.prisma.user.findUnique({ where: { id: event.userId } });
    if (!user) {
      this.logger.warn(
        `identity.password.reset_requested event ${event.eventId}: no User row for userId ${event.userId} — skipping`,
      );
      return;
    }

    // §3.5's own security-critical carve-out — never checks
    // NotificationPreference at all, unlike SYSTEM/welcome above.
    if (!this.serverUrlConfig.APP_URL) {
      // Fail loud, not a silently broken/missing link — real, visible
      // BullMQ `'failed'` event (DomainEventsModule's own logged hook),
      // never a link built against `undefined`.
      throw new Error('APP_URL is not configured — cannot build a working password-reset link');
    }
    const resetLink = `${this.serverUrlConfig.APP_URL}/password-reset/confirm?token=${payload.resetToken}`;
    const content = renderPasswordResetEmail(resetLink);
    await this.sendAndLog(user.id, user.email, 'SECURITY_ALERT', content);
  }

  private async sendAndLog(
    userId: string,
    email: string,
    type: 'SYSTEM' | 'SECURITY_ALERT',
    content: { subject: string; html: string; text: string },
  ): Promise<void> {
    try {
      await this.emailClient.send({ to: email, ...content });
      await this.writeLog(userId, type, 'SENT', null);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      await this.writeLog(userId, type, 'FAILED', failureReason);
      // Re-thrown so BullMQ's own attempts/backoff (E16 T1) retries a real
      // transient SMTP failure, matching `DomainEventDispatcher`'s own
      // "never silently skipped" discipline — the FAILED log row above
      // already makes this visible without waiting for the retry to
      // exhaust.
      throw error;
    }
  }

  private async writeLog(
    userId: string,
    type: 'SYSTEM' | 'SECURITY_ALERT',
    status: 'SENT' | 'FAILED',
    failureReason: string | null,
  ): Promise<void> {
    await this.prisma.notificationLog.create({
      data: {
        userId,
        channel: 'EMAIL',
        type,
        status,
        sentAt: status === 'SENT' ? new Date() : null,
        failureReason,
      },
    });
  }
}
