import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DeviceToken, PrismaClient } from '@linguaai/database';
import type { RegisterDeviceTokenRequest } from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

/**
 * `POST`/`DELETE /v1/notifications/device-tokens*` (E21 T4, design doc §5).
 * Runs through `app_role` (`APP_PRISMA_CLIENT`) — `DeviceToken` carries no
 * RLS policy (confirmed: `identity.prisma`'s own tenant-boundary tables
 * are `User`/`Organization`/`OrganizationMembership`/`Subscription`/
 * `AuditLog` only), and this is a genuine authenticated per-request
 * write keyed by `userId` from a JWT-verified `request.user`, the same
 * `NotificationPreferencesService` precedent.
 */
@Injectable()
export class DeviceTokensService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  /**
   * A real upsert on `token` (`@unique`, this same task's own migration) —
   * a device re-registering an already-known token reactivates the row
   * under the *current* caller, deliberately reassigning ownership on a
   * shared-device/account-switch token reuse rather than erroring, since
   * the newest registrant is the real, current owner (design doc §4).
   */
  async register(userId: string, dto: RegisterDeviceTokenRequest): Promise<DeviceToken> {
    return this.appPrisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, platform: dto.platform, token: dto.token, active: true },
      update: { userId, platform: dto.platform, active: true },
    });
  }

  /**
   * 404 (not 403) when the token doesn't exist or isn't the caller's own
   * — the same enumeration-resistance convention `CertificatesController`
   * (E20 T2) and `PersonalDictionaryController` (E9) already established:
   * a caller probing for someone else's token learns nothing distinct
   * from "unknown token."
   */
  async remove(userId: string, token: string): Promise<void> {
    const existing = await this.appPrisma.deviceToken.findUnique({ where: { token } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Device token not found');
    }
    await this.appPrisma.deviceToken.delete({ where: { token } });
  }
}
