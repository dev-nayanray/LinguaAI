import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginFailureEnv } from '@linguaai/config';
import type { Prisma, PrismaClient, User } from '@linguaai/database';
import { Prisma as PrismaNamespace } from '@linguaai/database';
import { hashPassword, hmacHash, verifyPassword } from '@linguaai/utils';
import type {
  LoginResponse,
  PasswordResetRequestResponse,
  PublicUser,
  RegisterRequest,
} from '@linguaai/validation/identity';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import { LOGIN_FAILURE_CONFIG } from './auth.config.js';
import { JtiDenylistService } from './jti-denylist.service.js';
import { MfaService } from './mfa/mfa.service.js';

/**
 * Placeholder, not legally reviewed — same discipline the design doc already
 * applies to the audit-retention window (Part 9B) and E1's budget-alert
 * threshold: an explicit, named placeholder pending real legal/compliance
 * input, not a silently-invented "final" value. Exported: OAuthService
 * (E2-T11) records the same TOS/PRIVACY_POLICY consent pair for
 * OAuth-created accounts.
 */
export const CURRENT_POLICY_VERSION = '1.0';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 1 hour from issuance (Part 5, `PasswordResetToken.expiresAt`). */
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** 5 minutes from issuance (Part 5, `MfaChallengeToken.expiresAt` — see schema.prisma's doc comment for why this is shorter than OAuthState's 10-minute CSRF TTL). */
const MFA_CHALLENGE_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Exported for OAuthService (E2-T11), which maps `User` rows to the same public shape after an OAuth account match/creation. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    timezone: user.timezone,
    role: user.role,
    status: user.status,
    mfaEnrolled: user.mfaEnrolled,
    organizationId: user.organizationId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
    private readonly jwtService: JwtService,
    private readonly events: DomainEventPublisher,
    @Inject(LOGIN_FAILURE_CONFIG) private readonly loginFailureConfig: LoginFailureEnv,
    private readonly mfaService: MfaService,
    private readonly jtiDenylist: JtiDenylistService,
  ) {}

  /**
   * Runs through `app_service_role` (Part 9's "Service-role exception") —
   * no `app.current_user_id` exists yet to satisfy `User`'s RLS policies
   * pre-registration. Duplicate email is detected via the unique-constraint
   * violation on the `INSERT` itself (Postgres error P2002), not a
   * separate SELECT-then-INSERT — the latter is a TOCTOU race under
   * concurrent duplicate registrations, the same atomic-claim discipline
   * E2-T5's governance functions already apply.
   */
  async register(dto: RegisterRequest): Promise<PublicUser> {
    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.servicePrisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            displayName: dto.displayName,
            locale: dto.locale,
            timezone: dto.timezone,
            // No email-verification endpoint exists anywhere in this Epic's
            // Part 6 API surface — PENDING_VERIFICATION has no transition
            // path to ACTIVE built here. Registering directly into ACTIVE
            // is a deliberate, flagged gap-fill (not the schema's nominal
            // default), not an oversight: leaving new accounts permanently
            // unable to log in would fail "no demo-level work."
            status: 'ACTIVE',
          },
        });

        const consentRows: Prisma.ConsentRecordCreateManyInput[] = [
          {
            userId: created.id,
            consentType: 'TOS',
            policyVersion: CURRENT_POLICY_VERSION,
            grantedAt: new Date(),
          },
          {
            userId: created.id,
            consentType: 'PRIVACY_POLICY',
            policyVersion: CURRENT_POLICY_VERSION,
            grantedAt: new Date(),
          },
        ];
        if (dto.marketingConsent) {
          consentRows.push({
            userId: created.id,
            consentType: 'MARKETING',
            policyVersion: CURRENT_POLICY_VERSION,
            grantedAt: new Date(),
          });
        }
        await tx.consentRecord.createMany({ data: consentRows });

        return created;
      });

      await this.events.publish('identity.user.registered', {
        userId: user.id,
        payload: { signupSource: 'password' },
      });
      await this.events.publish('identity.consent.recorded', {
        userId: user.id,
        payload: { consentType: 'TOS', policyVersion: CURRENT_POLICY_VERSION },
      });
      await this.events.publish('identity.consent.recorded', {
        userId: user.id,
        payload: { consentType: 'PRIVACY_POLICY', policyVersion: CURRENT_POLICY_VERSION },
      });
      if (dto.marketingConsent) {
        await this.events.publish('identity.consent.recorded', {
          userId: user.id,
          payload: { consentType: 'MARKETING', policyVersion: CURRENT_POLICY_VERSION },
        });
      }

      return toPublicUser(user);
    } catch (error) {
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  /**
   * Used by `LocalStrategy`. Runs the lookup through `app_service_role` —
   * see `prisma-clients.ts`'s doc comment for why a pre-auth `User` read
   * cannot go through the RLS-subject `app_role`. Returns `null` for any
   * failure that should read as generic "invalid credentials" to the
   * caller (SECURITY.md §6 enumeration resistance); `SUSPENDED` is the one
   * status that gets a distinct response, since the caller has already
   * proven account ownership by this point (correct password) — revealing
   * suspension here is not an enumeration leak.
   */
  async validateCredentials(
    email: string,
    password: string,
    ip: string | null,
  ): Promise<PublicUser | null> {
    const user = await this.servicePrisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      await this.publishLoginFailed(email, ip, user ? 'oauth_only_account' : 'no_such_account');
      return null;
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      await this.publishLoginFailed(email, ip, 'wrong_password');
      return null;
    }

    if (user.status === 'SUSPENDED') {
      await this.publishLoginFailed(email, ip, 'account_suspended');
      throw new ForbiddenException('This account has been suspended');
    }

    return toPublicUser(user);
  }

  /**
   * `identity.login.failed` (Part 10) — an HMAC-keyed email hash, never the
   * raw email or a bare (unkeyed, precomputable) hash. Fires for every
   * `validateCredentials` failure branch, including the `SUSPENDED` case:
   * the account's existence is already established by that point (correct
   * password proves ownership), so this isn't a new enumeration leak, and
   * repeated attempts against a suspended account are exactly the kind of
   * signal `analytics-service` would want to see.
   */
  private async publishLoginFailed(
    email: string,
    ip: string | null,
    reason: string,
  ): Promise<void> {
    await this.events.publish('identity.login.failed', {
      userId: null,
      payload: {
        emailHash: hmacHash(email, this.loginFailureConfig.LOGIN_FAILURE_HMAC_KEY),
        ip,
        reason,
      },
    });
  }

  /** Same pre-session justification as `validateCredentials` — runs before `app.current_org_id` exists. */
  private async lookupOrgRole(
    userId: string,
    organizationId: string | null,
  ): Promise<string | null> {
    if (!organizationId) {
      return null;
    }
    const membership = await this.servicePrisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return membership?.orgRole ?? null;
  }

  /**
   * Claim shape per Part 8 (remediation High-1): sub, role, organizationId,
   * orgRole, jti, iat, exp — iat/exp are populated by JwtService itself.
   * Returns `jti` alongside the signed token (E2-T28 remediation) — callers
   * persist it on the issuing `Session` row so `revokeSession`/
   * `revokeAllSessions` know which access token to denylist immediately.
   */
  private async signAccessToken(user: {
    id: string;
    role: string;
    organizationId: string | null;
  }): Promise<{ accessToken: string; jti: string }> {
    const orgRole = await this.lookupOrgRole(user.id, user.organizationId);
    const jti = randomUUID();
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      organizationId: user.organizationId,
      orgRole,
      jti,
    });
    return { accessToken, jti };
  }

  /**
   * Issues the access/refresh token pair and persists `Session`/
   * `RefreshToken` rows (Part 8). Runs through `app_role` — neither table
   * carries `organizationId`/RLS (E2-T4's policy matrix only covers `User`/
   * `Organization`/`OrganizationMembership`), so no service-role exception
   * is needed here, unlike the credential lookup above.
   */
  async issueSession(
    user: PublicUser,
    deviceLabel: string | null,
    ip: string | null,
  ): Promise<IssuedSession> {
    const { accessToken, jti } = await this.signAccessToken(user);
    const session = await this.appPrisma.session.create({
      data: { userId: user.id, deviceLabel, currentJti: jti },
    });

    const rawRefreshToken = randomBytes(48).toString('base64url');
    await this.appPrisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        tokenHash: hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    await this.events.publish('identity.session.created', {
      userId: user.id,
      tenantId: user.organizationId,
      payload: { ip, userAgent: deviceLabel, sessionId: session.id },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  /**
   * ADR-011's mandatory step-up: an MFA-enrolled `ADMIN`/`ENTERPRISE_ADMIN`
   * never receives a full session directly from `/v1/auth/login` — instead
   * this issues an `MfaChallengeToken` (Part 6's "partial session
   * (post-password, pre-MFA)") that `/mfa/challenge` later exchanges for the
   * real session via `completeMfaChallenge` below. `refreshToken` is `null`
   * in that branch specifically so `AuthController.login` knows not to set
   * the refresh cookie — no real session exists yet to attach it to. Any
   * other caller (a non-admin, or an admin who hasn't completed enrollment —
   * the same population `MfaGuard`'s later, post-hoc gate already governs)
   * gets the ordinary full session unchanged from before this branch existed.
   */
  async loginResponse(
    user: PublicUser,
    deviceLabel: string | null,
    ip: string | null,
  ): Promise<{ result: LoginResponse; refreshToken: string | null }> {
    if ((user.role === 'ADMIN' || user.role === 'ENTERPRISE_ADMIN') && user.mfaEnrolled) {
      const challengeToken = await this.createMfaChallengeToken(user.id);
      return { result: { status: 'MFA_REQUIRED', challengeToken }, refreshToken: null };
    }

    const { accessToken, refreshToken } = await this.issueSession(user, deviceLabel, ip);
    return { result: { status: 'AUTHENTICATED', accessToken, user }, refreshToken };
  }

  /**
   * Runs through `app_service_role` — same pre-session justification as
   * `requestPasswordReset`'s `PasswordResetToken` write: this happens inside
   * `loginResponse`, before any real session (and therefore any RLS tenant
   * context) exists.
   */
  private async createMfaChallengeToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');
    await this.servicePrisma.mfaChallengeToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + MFA_CHALLENGE_TOKEN_TTL_MS),
      },
    });
    return rawToken;
  }

  /**
   * `POST /v1/auth/mfa/challenge` (Part 6, E2-T22) — the second step of
   * ADR-011's mandatory admin step-up. Same atomic-claim discipline as
   * `confirmPasswordReset`: a `findUnique` first for a fast, generic 401 on
   * the ordinary not-found/expired/already-used cases, then an
   * `updateMany({ where: { usedAt: null } })` as the actual single-use
   * enforcement, closing the same TOCTOU window a plain read-then-write
   * would leave open.
   *
   * The TOTP code itself is checked *after* the token claim succeeds, via
   * `MfaService.verifyChallengeCode` — that method owns decrypting the
   * caller's persisted `mfaSecret` and the shared `MfaVerificationAttempt`
   * lockout (Part 8: the same 5-failures/10-minute lockout `/mfa/verify`
   * already uses, keyed by `userId`, not by challenge token — a caller who
   * requests several challenge tokens in a row doesn't get a fresh lockout
   * budget each time). A wrong code here does **not** re-open the claimed
   * token — it stays spent, matching a real user's actual retry path
   * (log in again, get a fresh challenge token), and avoids turning a
   * single-use artifact into a repeatable-guessing oracle.
   */
  async completeMfaChallenge(
    rawChallengeToken: string,
    code: string,
    deviceLabel: string | null,
    ip: string | null,
  ): Promise<{ result: LoginResponse; refreshToken: string }> {
    const tokenHash = hashToken(rawChallengeToken);
    const existing = await this.servicePrisma.mfaChallengeToken.findUnique({
      where: { tokenHash },
    });
    if (!existing || existing.usedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }

    const claim = await this.servicePrisma.mfaChallengeToken.updateMany({
      where: { id: existing.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }

    const valid = await this.mfaService.verifyChallengeCode(existing.userId, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const user = await this.servicePrisma.user.findUnique({ where: { id: existing.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account no longer active');
    }

    const publicUser = toPublicUser(user);
    const { accessToken, refreshToken } = await this.issueSession(publicUser, deviceLabel, ip);
    return { result: { status: 'AUTHENTICATED', accessToken, user: publicUser }, refreshToken };
  }

  /**
   * Revokes an entire session (and every `RefreshToken` under it) — used
   * both when refresh-token reuse is detected (Part 8: a reused token means
   * the session may be compromised, not just that one token) and by
   * `logout`/`UsersService`'s explicit session revocation (E2-T10). Public:
   * `UsersService` (a different module) calls this after its own
   * ownership check (a user may only revoke their own session).
   *
   * A single raw-SQL statement (a CTE), not Prisma's `$transaction([...])`
   * array as before E2-T14 — `tenant-rls.extension.ts` wraps every
   * individual `appPrisma` call in its own mini-transaction, which means an
   * *outer* `$transaction([opA, opB])` composed of two already-wrapped
   * calls silently loses the atomicity between them (verified empirically
   * against real Postgres: both calls still "succeed" individually, but no
   * longer share a transaction — a partial failure could revoke the
   * session but leave its refresh tokens live, exactly what this method
   * exists to prevent). One SQL statement is atomic by construction,
   * regardless of Prisma transaction machinery, and still passes through
   * the extension correctly as a single wrapped call (`Session`/
   * `RefreshToken` carry no RLS policy either way — E2-T4's matrix only
   * covers `User`/`Organization`/`OrganizationMembership` — so the
   * extension's SET here is inert, not load-bearing).
   */
  async revokeSession(sessionId: string, userId: string, reason: string): Promise<void> {
    // `$queryRaw` (not `$executeRaw`) — extended (E2-T28) to also RETURN
    // the session's `currentJti` so it can be denylisted immediately
    // (`JtiDenylistService`), closing the gap where a revoked session's
    // already-issued access token otherwise stayed valid until its own
    // natural 15-minute expiry.
    const [revoked] = await this.appPrisma.$queryRaw<{ currentJti: string | null }[]>`
      WITH revoked_session AS (
        UPDATE "Session" SET "revokedAt" = now() WHERE id = ${sessionId}::uuid RETURNING id, "currentJti"
      ),
      revoked_tokens AS (
        UPDATE "RefreshToken" SET "revokedAt" = now() WHERE "sessionId" = ${sessionId}::uuid AND "revokedAt" IS NULL RETURNING id
      )
      SELECT "currentJti" FROM revoked_session
    `;
    if (revoked?.currentJti) {
      await this.jtiDenylist.add(revoked.currentJti);
    }
    await this.events.publish('identity.session.revoked', {
      userId,
      payload: { sessionId, reason },
    });
  }

  /**
   * Revokes *every* active session for a user — `POST /v1/auth/password-reset/confirm`'s
   * "revokes all existing sessions on success" (Part 6), a broader operation
   * than `revokeSession`'s single-session scope. Same atomicity/inert-RLS
   * reasoning as `revokeSession`'s own doc comment (Session/RefreshToken
   * carry no RLS policy either way — E2-T4's matrix only covers `User`/
   * `Organization`/`OrganizationMembership`).
   */
  async revokeAllSessions(userId: string, reason: string): Promise<void> {
    // `$queryRaw` (not `$executeRaw`) — both data-modifying CTEs still run
    // to completion regardless of which one the final SELECT reads from
    // (Postgres's own documented WITH-clause behavior), so this remains one
    // atomic statement; the returned session ids are what `identity.session.revoked`
    // needs (Part 10: one event per revoked session, not one bulk event).
    // `currentJti` (E2-T28) is returned too, for the same immediate-denylist
    // reason as `revokeSession` above.
    const revoked = await this.appPrisma.$queryRaw<{ id: string; currentJti: string | null }[]>`
      WITH revoked_sessions AS (
        UPDATE "Session" SET "revokedAt" = now() WHERE "userId" = ${userId}::uuid AND "revokedAt" IS NULL RETURNING id, "currentJti"
      ),
      revoked_tokens AS (
        UPDATE "RefreshToken" SET "revokedAt" = now() WHERE "userId" = ${userId}::uuid AND "revokedAt" IS NULL RETURNING id
      )
      SELECT id, "currentJti" FROM revoked_sessions
    `;

    for (const { id: sessionId, currentJti } of revoked) {
      if (currentJti) {
        await this.jtiDenylist.add(currentJti);
      }
      await this.events.publish('identity.session.revoked', {
        userId,
        payload: { sessionId, reason },
      });
    }
  }

  /**
   * `POST /v1/auth/password-reset/request` (Part 6, E2-T19). Runs entirely
   * through `app_service_role` — the pre-auth credential lookup is the same
   * "no `app.current_user_id` exists yet" case as `validateCredentials`, and
   * creating the `PasswordResetToken` needs no privileged-column write but
   * is naturally grouped with the rest of this unauthenticated flow.
   *
   * Response shape is deliberately identical (`EMAIL_SENT`) whether the
   * email belongs to no account or to a real password account —
   * `passwordResetRequestResponseSchema`'s own doc comment explains the one
   * narrow, deliberate exception (`OAUTH_ACCOUNT`).
   *
   * NOT YET IMPLEMENTED: actual email delivery (BullMQ → notification-service,
   * per the design doc's "Email delivery unavailable... durably queued and
   * retried" text) — no message-queue producer exists anywhere in this
   * codebase yet; building one is genuinely separate infrastructure, out of
   * this task's own scope, the same class of deferral already applied to
   * `identity.user.registered` (E2-T8) and the GDPR deletion-request event
   * (E2-T18). The created `PasswordResetToken` row is the durable, correct
   * artifact in the meantime. The raw token is deliberately never returned
   * in this response — unlike the missing-event-bus cases above, that
   * wouldn't be a harmless stand-in, it would be a genuine account-takeover
   * vector (anyone who knows an email could reset that account's password).
   */
  async requestPasswordReset(email: string): Promise<PasswordResetRequestResponse> {
    const user = await this.servicePrisma.user.findUnique({ where: { email } });
    if (!user) {
      return { status: 'EMAIL_SENT' };
    }
    if (!user.passwordHash) {
      const oauthAccounts = await this.servicePrisma.oAuthAccount.findMany({
        where: { userId: user.id },
      });
      return {
        status: 'OAUTH_ACCOUNT',
        providers: oauthAccounts.map((account) => account.provider),
      };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const resetToken = await this.servicePrisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    // `resetToken-reference`, never the raw token (Part 10) — the
    // PasswordResetToken row's own id, which reveals nothing usable to
    // complete a reset (the raw token itself is never persisted anywhere).
    await this.events.publish('identity.password.reset_requested', {
      userId: user.id,
      payload: { resetTokenReference: resetToken.id },
    });

    return { status: 'EMAIL_SENT' };
  }

  /**
   * `POST /v1/auth/password-reset/confirm` (Part 6). Same atomic-claim
   * discipline as `refreshSession`'s rotation (Part 9C: never trust a
   * plain read-then-write for a single-use token) — the `updateMany({
   * where: { usedAt: null } })` is the actual single-use enforcement; the
   * preceding `findUnique` only produces a fast, generic 401 for the
   * ordinary not-found/expired/already-used cases without a second
   * round-trip.
   */
  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const existing = await this.servicePrisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!existing || existing.usedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const claim = await this.servicePrisma.passwordResetToken.updateMany({
      where: { id: existing.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.servicePrisma.user.update({
      where: { id: existing.userId },
      data: { passwordHash, tokensValidAfter: new Date() },
    });

    await this.revokeAllSessions(existing.userId, 'password_reset');
  }

  /**
   * `POST /v1/auth/logout` (Part 6): "revoke current session." The access
   * token (already verified by `JwtAuthGuard` before this runs) proves who
   * the caller is but carries no `sessionId` — Part 8's claim shape is
   * `sub`/`role`/`organizationId`/`orgRole`/`jti`/`iat`/`exp` only, and
   * extending it would mean a new ADR, not a decision this task makes
   * unilaterally. Instead, this reads the same httpOnly refresh-token
   * cookie `/v1/auth/refresh` already reads, since it already maps 1:1 to
   * a `Session` via `RefreshToken.sessionId` — no new mechanism, reusing
   * the existing lookup. **Known gap, not solved here**: a non-cookie
   * client (e.g. the Flutter mobile app, E21 — Part 8 stores its refresh
   * token in platform Keychain/Keystore, not a cookie) has no way to
   * identify "current session" through this endpoint as specified; that
   * needs its own decision (e.g. accepting the token in the request body)
   * when a real mobile client exists to design against.
   *
   * Defense in depth: `callerId` (the Bearer token's own `sub`, already
   * verified by `JwtAuthGuard`) must match the cookie-resolved session's
   * owner — a caller can only ever log out their own session through this
   * endpoint, even if some future bug ever let a mismatched cookie reach
   * this far.
   */
  async logout(rawRefreshToken: string | undefined, callerId: string): Promise<void> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException(
        'No refresh token provided — cannot identify the current session',
      );
    }
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.appPrisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.userId !== callerId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.revokeSession(existing.sessionId, callerId, 'logout');
  }

  /**
   * Atomic refresh-token rotation (Part 8). The "mark old token used, issue
   * new one" step is a single conditional `UPDATE ... WHERE revokedAt IS
   * NULL` — Part 8's own text describes this against a `used` boolean
   * column that doesn't actually exist on `RefreshToken` (Part 5); `revokedAt
   * IS NULL` is the real schema's equivalent atomic claim predicate, same
   * race-free pattern E2-T5's governance functions already use. If two
   * requests race on the same token, exactly one succeeds (this method
   * returns normally); the other's `updateMany` reports zero rows — treated
   * identically to genuine reuse (full-session revocation), per Part 8,
   * not silently ignored.
   */
  async refreshSession(rawRefreshToken: string): Promise<IssuedSession> {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.appPrisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const claim = await this.appPrisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claim.count === 0) {
      await this.revokeSession(existing.sessionId, existing.userId, 'refresh_token_reuse_detected');
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    const user = await this.servicePrisma.user.findUnique({ where: { id: existing.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account no longer active');
    }

    const rawNewRefreshToken = randomBytes(48).toString('base64url');
    await this.appPrisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: existing.sessionId,
        tokenHash: hashToken(rawNewRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        rotatedFromId: existing.id,
      },
    });

    // `currentJti` updated alongside rotation (E2-T28) — the previous
    // token's jti is deliberately left un-denylisted here: a normal
    // rotation isn't a revocation, and the old access token simply expires
    // naturally on its own 15-minute TTL, same as before this change.
    const { accessToken, jti } = await this.signAccessToken(user);
    await this.appPrisma.session.update({
      where: { id: existing.sessionId },
      data: { lastSeenAt: new Date(), currentJti: jti },
    });

    return { accessToken, refreshToken: rawNewRefreshToken };
  }

  /**
   * Part 8's staleness policy: `jwt.iat >= user.tokensValidAfter`, checked
   * fresh on every request rather than trusted from the token's own claims
   * (which is exactly what would go stale). Runs through `app_service_role`
   * — this check happens inside `JwtStrategy.validate()`, before
   * `tenant.middleware.ts` (E2-T14) has set any RLS session context, the
   * same pre-session category as `validateCredentials`/`issueSession`'s
   * org-role lookup above. A single-column `select`, matching Part 8's own
   * "cheap, indexed lookup, not a full User fetch" description.
   */
  async isTokenStale(userId: string, issuedAtSeconds: number): Promise<boolean> {
    const user = await this.servicePrisma.user.findUnique({
      where: { id: userId },
      select: { tokensValidAfter: true },
    });
    if (!user) {
      return true;
    }
    const tokensValidAfterSeconds = Math.floor(user.tokensValidAfter.getTime() / 1000);
    return issuedAtSeconds < tokensValidAfterSeconds;
  }
}
