import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { MfaEnv } from '@linguaai/config';
import type { PrismaClient } from '@linguaai/database';
import { getCorrelationId } from '@linguaai/observability';
import { decodeEncryptionKey, decryptField, encryptField } from '@linguaai/utils';
import { authenticator } from 'otplib';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../../database/index.js';
import { DomainEventPublisher } from '../../../events/index.js';
import { MFA_CONFIG } from '../auth.config.js';

const ISSUER = 'LinguaAI';
/** Part 8 (remediation High-4): 5 failed attempts within a 10-minute window locks this step for 15 minutes. */
const LOCKOUT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface MfaEnrollmentStart {
  secret: string;
  otpauthUrl: string;
}

/**
 * TOTP (RFC 6238) enrollment/verification (ADR-019, Part 15). Enrollment is
 * two steps (Part 6): `beginEnrollment` generates a secret and returns it
 * to the caller (QR/manual-entry payload) without writing anything —
 * `User.mfaSecret`'s only writer is the `complete_mfa_enrollment()`
 * `SECURITY DEFINER` function (E2-T5), and Part 9C's column-privilege
 * allowlist (E2-T6) means no other write path exists even if this service
 * wanted one.
 *
 * The pending secret is round-tripped through the client (returned here,
 * resubmitted at `completeEnrollment`) rather than held server-side. This
 * is deliberate, not an oversight: storing it server-side would need its
 * own new table (another Part 5 gap, like `OAuthState`/
 * `MfaVerificationAttempt`) for no real security gain — both endpoints
 * already require the *same* Bearer-authenticated caller, so a
 * client-round-tripped secret and a server-stashed one prove the identical
 * thing (this authenticated caller can compute a valid code for this
 * secret). What Part 9C's write-path lockdown actually protects against —
 * enrollment completing without a real code check — holds either way,
 * since `completeEnrollment` always verifies the code before calling the
 * governance function.
 */
@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;

  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
    @Inject(MFA_CONFIG) mfaConfig: MfaEnv,
    private readonly events: DomainEventPublisher,
  ) {
    this.encryptionKey = decodeEncryptionKey(mfaConfig.MFA_SECRET_ENCRYPTION_KEY);
  }

  /**
   * `POST /v1/auth/mfa/enroll`. The email lookup runs through
   * `app_service_role` — `User`'s RLS `user_read` policy needs
   * `app.current_user_id`/`app.is_platform_admin`, which nothing sets yet
   * (`tenant.middleware.ts` is E2-T14) — same pre-session category as
   * `AuthService.validateCredentials`/`isTokenStale`.
   */
  async beginEnrollment(userId: string): Promise<MfaEnrollmentStart> {
    const user = await this.servicePrisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
    return { secret, otpauthUrl };
  }

  /**
   * `POST /v1/auth/mfa/verify`. Checks the lockout state *before*
   * verifying the code — a locked-out caller can't burn additional
   * attempts probing while locked, and the rejection is indistinguishable
   * in shape from a plain wrong-code rejection (401 either way), so a
   * response can't be used to detect lockout state versus a wrong guess.
   *
   * `complete_mfa_enrollment()` is `SECURITY DEFINER` and independently
   * verifies `current_setting('app.current_user_id') = p_user_id` (Part
   * 9C, Finding 3). Until E2-T14, this call site set that itself via
   * `set_config(..., true)` in an explicit `$transaction([...])` — now
   * that `tenant-rls.extension.ts` (E2-T14) transparently wraps every
   * `appPrisma` call in exactly that same "SET + call, same transaction"
   * shape (reading the caller's identity from `TenantContextInterceptor`'s
   * `AsyncLocalStorage` context, populated from this same `userId` since
   * `/v1/auth/mfa/verify` is `AuthGuard('jwt')`-guarded), the manual
   * version here would double up — verified empirically that wrapping an
   * already-extension-wrapped call in a second, hand-rolled
   * `$transaction([...])` array breaks (each array element gets
   * independently re-wrapped by the extension before the outer batch ever
   * sees it, since extension interception happens at call time, not at
   * `$transaction()` time). A single call lets the extension supply the
   * SET automatically, same as any other `appPrisma` call site.
   */
  async completeEnrollment(userId: string, pendingSecret: string, code: string): Promise<void> {
    await this.enforceLockout(userId);

    const valid = authenticator.verify({ token: code, secret: pendingSecret });
    await this.recordAttempt(userId, valid);
    if (!valid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const encryptedSecret = encryptField(pendingSecret, this.encryptionKey);
    const correlationId = getCorrelationId() ?? randomUUID();

    await this.appPrisma
      .$executeRaw`SELECT complete_mfa_enrollment(${userId}::uuid, ${encryptedSecret}::text, ${correlationId}::uuid)`;

    await this.events.publish('identity.mfa.enrolled', { userId, payload: {} });
  }

  /**
   * `AuthService.completeMfaChallenge` (E2-T22, `POST /v1/auth/mfa/challenge`)
   * — the login step-up counterpart to `completeEnrollment`, sharing its
   * exact lockout discipline (`enforceLockout`/`recordAttempt` against the
   * same `MfaVerificationAttempt` table, keyed by `userId`) per
   * `MfaVerificationAttempt`'s own schema doc comment, which already
   * anticipated both `/mfa/verify` and `/mfa/challenge` joining one
   * "rate-limited + lockout class." Unlike `completeEnrollment`, there is no
   * client-round-tripped pending secret here — enrollment already completed,
   * so the real secret is decrypted from `User.mfaSecret` via
   * `app_service_role` (no RLS/tenant context exists yet at this pre-session
   * point in the login flow, the same category as `AuthService.validateCredentials`).
   * Returns a bare boolean rather than throwing on an invalid code — the
   * caller (`AuthService.completeMfaChallenge`) needs to fold this into the
   * same generic `UnauthorizedException` its own token-claim checks already
   * throw, not a distinct error shape.
   */
  async verifyChallengeCode(userId: string, code: string): Promise<boolean> {
    await this.enforceLockout(userId);

    const user = await this.servicePrisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    if (!user.mfaSecret) {
      // Defensive only — AuthService.loginResponse already gates this whole
      // flow on `user.mfaEnrolled`, which is set only alongside a persisted
      // `mfaSecret` (complete_mfa_enrollment() writes both together).
      await this.recordAttempt(userId, false);
      return false;
    }

    const decryptedSecret = decryptField(user.mfaSecret, this.encryptionKey);
    const valid = authenticator.verify({ token: code, secret: decryptedSecret });
    await this.recordAttempt(userId, valid);
    return valid;
  }

  private async enforceLockout(userId: string): Promise<void> {
    const lastFailures = await this.appPrisma.mfaVerificationAttempt.findMany({
      where: { userId, succeeded: false },
      orderBy: { occurredAt: 'desc' },
      take: LOCKOUT_MAX_FAILURES,
    });
    if (lastFailures.length < LOCKOUT_MAX_FAILURES) {
      return;
    }

    const newest = lastFailures[0]!.occurredAt;
    const oldest = lastFailures[LOCKOUT_MAX_FAILURES - 1]!.occurredAt;
    const clusteredWithinWindow = newest.getTime() - oldest.getTime() <= LOCKOUT_WINDOW_MS;
    if (!clusteredWithinWindow) {
      return;
    }

    const lockedUntil = new Date(newest.getTime() + LOCKOUT_DURATION_MS);
    if (new Date() < lockedUntil) {
      throw new ForbiddenException('Too many failed verification attempts — try again later');
    }
  }

  private async recordAttempt(userId: string, succeeded: boolean): Promise<void> {
    await this.appPrisma.mfaVerificationAttempt.create({ data: { userId, succeeded } });
  }
}
