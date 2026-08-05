import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { LoginFailureEnv } from '@linguaai/config';
import { Prisma, type PrismaClient } from '@linguaai/database';
import * as utils from '@linguaai/utils';
import type { PublicUser, RegisterRequest } from '@linguaai/validation/identity';

import type { DomainEventPublisher } from '../../events/index.js';
import { AuthService } from './auth.service.js';
import type { JtiDenylistService } from './jti-denylist.service.js';
import type { MfaService } from './mfa/mfa.service.js';

jest.mock('@linguaai/utils', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
  hmacHash: jest.fn().mockReturnValue('hashed-email'),
}));

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'user@test.local',
    passwordHash: '$argon2id$fake',
    displayName: 'Test User',
    avatarUrl: null,
    locale: 'en-US',
    timezone: 'UTC',
    role: 'USER',
    status: 'ACTIVE',
    mfaEnrolled: false,
    mfaSecret: null,
    organizationId: null,
    tokensValidAfter: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let appPrisma: {
    session: { create: jest.Mock; update: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    organizationMembership: { findUnique: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let servicePrisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock; update: jest.Mock };
    organizationMembership: { findUnique: jest.Mock };
    oAuthAccount: { findMany: jest.Mock };
    passwordResetToken: { findUnique: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
    mfaChallengeToken: { findUnique: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
  };
  let jwtService: { signAsync: jest.Mock };
  let events: { publish: jest.Mock };
  let loginFailureConfig: LoginFailureEnv;
  let mfaService: { verifyChallengeCode: jest.Mock };
  let jtiDenylist: { add: jest.Mock; isDenylisted: jest.Mock };
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    appPrisma = {
      session: { create: jest.fn(), update: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      organizationMembership: { findUnique: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    servicePrisma = {
      $transaction: jest.fn(),
      user: { findUnique: jest.fn(), update: jest.fn() },
      organizationMembership: { findUnique: jest.fn() },
      oAuthAccount: { findMany: jest.fn() },
      passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
      mfaChallengeToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    };
    jwtService = { signAsync: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    loginFailureConfig = { LOGIN_FAILURE_HMAC_KEY: 'dGVzdC1rZXk=' };
    mfaService = { verifyChallengeCode: jest.fn() };
    jtiDenylist = {
      add: jest.fn().mockResolvedValue(undefined),
      isDenylisted: jest.fn().mockResolvedValue(false),
    };

    authService = new AuthService(
      appPrisma as unknown as PrismaClient,
      servicePrisma as unknown as PrismaClient,
      jwtService as unknown as JwtService,
      events as unknown as DomainEventPublisher,
      loginFailureConfig,
      mfaService as unknown as MfaService,
      jtiDenylist as unknown as JtiDenylistService,
    );
  });

  describe('register', () => {
    const dto: RegisterRequest = {
      email: 'new@test.local',
      password: 'correct horse battery staple',
      displayName: 'New User',
      locale: 'en-US',
      timezone: 'UTC',
      tosAccepted: true,
      privacyPolicyAccepted: true,
      marketingConsent: false,
    };

    it('creates the user with status ACTIVE and TOS/PRIVACY_POLICY consent rows, never MARKETING when not requested', async () => {
      (utils.hashPassword as jest.Mock).mockResolvedValue('hashed');
      const createdUser = makeUserRow({
        id: 'u-2',
        email: dto.email,
        displayName: dto.displayName,
      });
      const txUserCreate = jest.fn().mockResolvedValue(createdUser);
      const txConsentCreateMany = jest.fn().mockResolvedValue({ count: 2 });
      servicePrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ user: { create: txUserCreate }, consentRecord: { createMany: txConsentCreateMany } }),
      );

      const result = await authService.register(dto);

      expect(txUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: dto.email,
            status: 'ACTIVE',
            passwordHash: 'hashed',
          }),
        }),
      );
      const consentTypes = (
        txConsentCreateMany.mock.calls[0][0].data as { consentType: string }[]
      ).map((c) => c.consentType);
      expect(consentTypes.sort()).toEqual(['PRIVACY_POLICY', 'TOS']);
      expect(result).toEqual(expect.objectContaining({ id: 'u-2', email: dto.email }));
      expect(result).not.toHaveProperty('passwordHash');

      // identity.user.registered + one identity.consent.recorded per row
      // created above (TOS/PRIVACY_POLICY, no MARKETING here).
      expect(events.publish).toHaveBeenCalledWith(
        'identity.user.registered',
        expect.objectContaining({ userId: 'u-2' }),
      );
      const consentEventTypes = events.publish.mock.calls
        .filter(([type]: [string]) => type === 'identity.consent.recorded')
        .map(
          ([, params]: [string, { payload: { consentType: string } }]) =>
            params.payload.consentType,
        );
      expect(consentEventTypes.sort()).toEqual(['PRIVACY_POLICY', 'TOS']);
    });

    it('includes a MARKETING consent row when marketingConsent is true', async () => {
      (utils.hashPassword as jest.Mock).mockResolvedValue('hashed');
      const createdUser = makeUserRow();
      const txConsentCreateMany = jest.fn().mockResolvedValue({ count: 3 });
      servicePrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          consentRecord: { createMany: txConsentCreateMany },
        }),
      );

      await authService.register({ ...dto, marketingConsent: true });

      const consentTypes = (
        txConsentCreateMany.mock.calls[0][0].data as { consentType: string }[]
      ).map((c) => c.consentType);
      expect(consentTypes).toContain('MARKETING');
      expect(events.publish).toHaveBeenCalledWith(
        'identity.consent.recorded',
        expect.objectContaining({ payload: { consentType: 'MARKETING', policyVersion: '1.0' } }),
      );
    });

    it('translates a Postgres unique-constraint violation (P2002) into ConflictException', async () => {
      (utils.hashPassword as jest.Mock).mockResolvedValue('hashed');
      servicePrisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(authService.register(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows any other error unchanged', async () => {
      (utils.hashPassword as jest.Mock).mockResolvedValue('hashed');
      const dbError = new Error('connection reset');
      servicePrisma.$transaction.mockRejectedValue(dbError);

      await expect(authService.register(dto)).rejects.toBe(dbError);
    });
  });

  describe('validateCredentials', () => {
    it('returns null and publishes identity.login.failed (no_such_account) when no user exists for the email', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        authService.validateCredentials('nobody@test.local', 'anything', '1.2.3.4'),
      ).resolves.toBeNull();
      expect(events.publish).toHaveBeenCalledWith(
        'identity.login.failed',
        expect.objectContaining({
          userId: null,
          payload: expect.objectContaining({ ip: '1.2.3.4', reason: 'no_such_account' }) as unknown,
        }),
      );
    });

    it('returns null and publishes identity.login.failed (oauth_only_account) for an OAuth-only account (no passwordHash)', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow({ passwordHash: null }));
      await expect(
        authService.validateCredentials('user@test.local', 'anything', null),
      ).resolves.toBeNull();
      expect(events.publish).toHaveBeenCalledWith(
        'identity.login.failed',
        expect.objectContaining({
          payload: expect.objectContaining({ reason: 'oauth_only_account' }) as unknown,
        }),
      );
    });

    it('returns null and publishes identity.login.failed (wrong_password) when the password does not verify', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow());
      (utils.verifyPassword as jest.Mock).mockResolvedValue(false);
      await expect(
        authService.validateCredentials('user@test.local', 'wrong', null),
      ).resolves.toBeNull();
      expect(events.publish).toHaveBeenCalledWith(
        'identity.login.failed',
        expect.objectContaining({
          payload: expect.objectContaining({ reason: 'wrong_password' }) as unknown,
        }),
      );
    });

    it('throws ForbiddenException and publishes identity.login.failed (account_suspended) for a SUSPENDED account with a correct password', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'SUSPENDED' }));
      (utils.verifyPassword as jest.Mock).mockResolvedValue(true);
      await expect(
        authService.validateCredentials('user@test.local', 'correct', null),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.login.failed',
        expect.objectContaining({
          payload: expect.objectContaining({ reason: 'account_suspended' }) as unknown,
        }),
      );
    });

    it('returns the public user shape on success, without publishing identity.login.failed', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow());
      (utils.verifyPassword as jest.Mock).mockResolvedValue(true);
      const result = await authService.validateCredentials('user@test.local', 'correct', null);
      expect(result).toEqual(expect.objectContaining({ email: 'user@test.local' }));
      expect(result).not.toHaveProperty('passwordHash');
      expect(events.publish).not.toHaveBeenCalledWith('identity.login.failed', expect.anything());
    });
  });

  describe('issueSession / loginResponse', () => {
    const publicUser: PublicUser = {
      id: 'u-1',
      email: 'user@test.local',
      displayName: 'Test User',
      avatarUrl: null,
      locale: 'en-US',
      timezone: 'UTC',
      role: 'USER',
      status: 'ACTIVE',
      mfaEnrolled: false,
      organizationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('creates a Session and RefreshToken, and signs a JWT with the Part 8 claim shape', async () => {
      appPrisma.session.create.mockResolvedValue({ id: 's-1' });
      appPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      jwtService.signAsync.mockResolvedValue('signed.jwt.token');

      const { accessToken, refreshToken } = await authService.issueSession(
        publicUser,
        'jest-agent',
        '1.2.3.4',
      );

      expect(accessToken).toBe('signed.jwt.token');
      expect(typeof refreshToken).toBe('string');
      expect(refreshToken.length).toBeGreaterThan(0);
      // currentJti (E2-T28) is a freshly-generated randomUUID() per call —
      // asserted as "a string", not an exact value.
      expect(appPrisma.session.create).toHaveBeenCalledWith({
        data: {
          userId: publicUser.id,
          deviceLabel: 'jest-agent',
          currentJti: expect.any(String) as unknown as string,
        },
      });
      expect(appPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: publicUser.id, sessionId: 's-1' }),
        }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: publicUser.id,
          role: 'USER',
          organizationId: null,
          orgRole: null,
        }),
      );
      // The org lookup runs through the service-role client (pre-session
      // justification, prisma-clients.ts), never the app-role client.
      expect(servicePrisma.organizationMembership.findUnique).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        'identity.session.created',
        expect.objectContaining({
          userId: publicUser.id,
          payload: { ip: '1.2.3.4', userAgent: 'jest-agent', sessionId: 's-1' },
        }),
      );
    });

    it('looks up orgRole via the service-role client when the user belongs to an organization', async () => {
      appPrisma.session.create.mockResolvedValue({ id: 's-1' });
      appPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      servicePrisma.organizationMembership.findUnique.mockResolvedValue({
        orgRole: 'ENTERPRISE_ADMIN',
      });
      jwtService.signAsync.mockResolvedValue('signed.jwt.token');

      const orgUser: PublicUser = { ...publicUser, organizationId: 'org-1' };
      await authService.issueSession(orgUser, null, null);

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ orgRole: 'ENTERPRISE_ADMIN' }),
      );
    });

    it('loginResponse wraps issueSession into the AUTHENTICATED LoginResponse shape and surfaces the raw refresh token separately', async () => {
      appPrisma.session.create.mockResolvedValue({ id: 's-1' });
      appPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      jwtService.signAsync.mockResolvedValue('signed.jwt.token');

      const { result, refreshToken } = await authService.loginResponse(publicUser, null, null);

      expect(result).toEqual({
        status: 'AUTHENTICATED',
        accessToken: 'signed.jwt.token',
        user: publicUser,
      });
      expect(typeof refreshToken).toBe('string');
    });

    it('loginResponse issues an ordinary full session for an ADMIN who has not enrolled MFA', async () => {
      appPrisma.session.create.mockResolvedValue({ id: 's-1' });
      appPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      jwtService.signAsync.mockResolvedValue('signed.jwt.token');

      const unenrolledAdmin: PublicUser = { ...publicUser, role: 'ADMIN', mfaEnrolled: false };
      const { result, refreshToken } = await authService.loginResponse(unenrolledAdmin, null, null);

      expect(result).toEqual({
        status: 'AUTHENTICATED',
        accessToken: 'signed.jwt.token',
        user: unenrolledAdmin,
      });
      expect(typeof refreshToken).toBe('string');
      expect(servicePrisma.mfaChallengeToken.create).not.toHaveBeenCalled();
    });

    it.each(['ADMIN', 'ENTERPRISE_ADMIN'] as const)(
      'loginResponse issues an MfaChallengeToken instead of a full session for an MFA-enrolled %s (ADR-011 step-up)',
      async (role) => {
        servicePrisma.mfaChallengeToken.create.mockResolvedValue({ id: 'mct-1' });

        const enrolledAdmin: PublicUser = { ...publicUser, role, mfaEnrolled: true };
        const { result, refreshToken } = await authService.loginResponse(enrolledAdmin, null, null);

        expect(result.status).toBe('MFA_REQUIRED');
        expect(result).toHaveProperty('challengeToken');
        expect(refreshToken).toBeNull();
        expect(appPrisma.session.create).not.toHaveBeenCalled();
        expect(servicePrisma.mfaChallengeToken.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ userId: enrolledAdmin.id }) }),
        );
      },
    );
  });

  describe('completeMfaChallenge', () => {
    const existingChallenge = {
      id: 'mct-1',
      userId: 'u-1',
      tokenHash: 'irrelevant-for-the-mock',
      expiresAt: new Date(Date.now() + 1000 * 60 * 5),
      usedAt: null,
    };

    it('throws UnauthorizedException when no token matches the hash', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue(null);
      await expect(
        authService.completeMfaChallenge('unknown-raw-token', '123456', null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for an expired token without attempting the atomic claim', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue({
        ...existingChallenge,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        authService.completeMfaChallenge('raw-token', '123456', null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(servicePrisma.mfaChallengeToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for an already-used token without attempting the atomic claim', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue({
        ...existingChallenge,
        usedAt: new Date(),
      });
      await expect(
        authService.completeMfaChallenge('raw-token', '123456', null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(servicePrisma.mfaChallengeToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException on a lost claim race (claim.count === 0) without checking the code', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue(existingChallenge);
      servicePrisma.mfaChallengeToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        authService.completeMfaChallenge('raw-token', '123456', null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mfaService.verifyChallengeCode).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the TOTP code is wrong, without issuing a session — the claimed token stays spent', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue(existingChallenge);
      servicePrisma.mfaChallengeToken.updateMany.mockResolvedValue({ count: 1 });
      mfaService.verifyChallengeCode.mockResolvedValue(false);

      await expect(
        authService.completeMfaChallenge('raw-token', '000000', null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(appPrisma.session.create).not.toHaveBeenCalled();
    });

    it('rejects when the claimed user is no longer ACTIVE', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue(existingChallenge);
      servicePrisma.mfaChallengeToken.updateMany.mockResolvedValue({ count: 1 });
      mfaService.verifyChallengeCode.mockResolvedValue(true);
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'SUSPENDED' }));

      await expect(
        authService.completeMfaChallenge('raw-token', '123456', null, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(appPrisma.session.create).not.toHaveBeenCalled();
    });

    it('on a valid code, issues a full AUTHENTICATED session', async () => {
      servicePrisma.mfaChallengeToken.findUnique.mockResolvedValue(existingChallenge);
      servicePrisma.mfaChallengeToken.updateMany.mockResolvedValue({ count: 1 });
      mfaService.verifyChallengeCode.mockResolvedValue(true);
      servicePrisma.user.findUnique.mockResolvedValue(
        makeUserRow({ id: 'u-1', role: 'ADMIN', mfaEnrolled: true, status: 'ACTIVE' }),
      );
      appPrisma.session.create.mockResolvedValue({ id: 's-1' });
      appPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      jwtService.signAsync.mockResolvedValue('signed.jwt.token');

      const { result, refreshToken } = await authService.completeMfaChallenge(
        'raw-token',
        '123456',
        'jest-agent',
        '1.2.3.4',
      );

      expect(result).toEqual(
        expect.objectContaining({ status: 'AUTHENTICATED', accessToken: 'signed.jwt.token' }),
      );
      expect(typeof refreshToken).toBe('string');
      expect(mfaService.verifyChallengeCode).toHaveBeenCalledWith('u-1', '123456');
    });
  });

  describe('refreshSession', () => {
    const existingToken = {
      id: 'rt-old',
      userId: 'u-1',
      sessionId: 's-1',
      tokenHash: 'irrelevant-for-the-mock',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      rotatedFromId: null,
      revokedAt: null,
    };

    it('throws UnauthorizedException when no token matches the hash', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(authService.refreshSession('unknown-raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for an expired token without attempting the atomic claim', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue({
        ...existingToken,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(authService.refreshSession('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(appPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('on a lost race (claim.count === 0), revokes the whole session and throws — the reuse-detection path', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue(existingToken);
      appPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(authService.refreshSession('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // revokeSession (E2-T14, switched to $queryRaw in E2-T28 to also
      // RETURN currentJti for immediate denylisting) is a single raw-SQL
      // statement, not session.update/refreshToken.updateMany calls — see
      // auth.service.ts.
      expect(appPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const revokeArgs = appPrisma.$queryRaw.mock.calls[0] as unknown[];
      expect(revokeArgs.slice(1)).toEqual([existingToken.sessionId, existingToken.sessionId]);
      // The winning claim attempt is the only updateMany call — no new
      // token was minted for the loser.
      expect(appPrisma.refreshToken.create).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        'identity.session.revoked',
        expect.objectContaining({
          userId: existingToken.userId,
          payload: { sessionId: existingToken.sessionId, reason: 'refresh_token_reuse_detected' },
        }),
      );
    });

    it('rejects when the user behind a successfully-claimed token is no longer ACTIVE', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue(existingToken);
      appPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow({ status: 'SUSPENDED' }));

      await expect(authService.refreshSession('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('on a won claim (claim.count === 1), rotates: creates a new RefreshToken chained via rotatedFromId, bumps lastSeenAt, and signs a new access token', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue(existingToken);
      appPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow({ id: 'u-1', status: 'ACTIVE' }));
      appPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });
      jwtService.signAsync.mockResolvedValue('new.jwt.token');

      const { accessToken, refreshToken } = await authService.refreshSession('raw-token');

      expect(accessToken).toBe('new.jwt.token');
      expect(typeof refreshToken).toBe('string');
      expect(appPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u-1',
            sessionId: existingToken.sessionId,
            rotatedFromId: existingToken.id,
          }),
        }),
      );
      expect(appPrisma.session.update).toHaveBeenCalledWith({
        where: { id: existingToken.sessionId },
        data: {
          lastSeenAt: expect.any(Date) as unknown as Date,
          currentJti: expect.any(String) as unknown as string,
        },
      });
    });
  });

  describe('isTokenStale', () => {
    it('returns true (fail closed) when the user no longer exists', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(null);
      await expect(authService.isTokenStale('u-gone', 0)).resolves.toBe(true);
    });

    it('returns true when the token was issued before tokensValidAfter', async () => {
      const tokensValidAfter = new Date('2026-01-01T00:10:00.000Z');
      servicePrisma.user.findUnique.mockResolvedValue({ tokensValidAfter });
      const issuedAtBeforeBump = Math.floor(new Date('2026-01-01T00:00:00.000Z').getTime() / 1000);

      await expect(authService.isTokenStale('u-1', issuedAtBeforeBump)).resolves.toBe(true);
    });

    it('returns false when the token was issued at or after tokensValidAfter', async () => {
      const tokensValidAfter = new Date('2026-01-01T00:10:00.000Z');
      servicePrisma.user.findUnique.mockResolvedValue({ tokensValidAfter });
      const issuedAtAfterBump = Math.floor(new Date('2026-01-01T00:20:00.000Z').getTime() / 1000);

      await expect(authService.isTokenStale('u-1', issuedAtAfterBump)).resolves.toBe(false);
    });
  });

  describe('logout', () => {
    it('throws UnauthorizedException when no refresh token cookie was provided', async () => {
      await expect(authService.logout(undefined, 'u-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(appPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the token does not exist', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(authService.logout('raw-token', 'u-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException (defense in depth) when the token belongs to a different user than the caller', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'someone-else',
        sessionId: 's-1',
      });
      await expect(authService.logout('raw-token', 'u-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(appPrisma.session.update).not.toHaveBeenCalled();
    });

    it('revokes the session when the token is valid and owned by the caller', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-1',
        sessionId: 's-1',
      });

      await authService.logout('raw-token', 'u-1');

      // revokeSession (E2-T14, switched to $queryRaw in E2-T28 to also
      // RETURN currentJti) is a single raw-SQL statement — see auth.service.ts.
      expect(appPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const revokeArgs = appPrisma.$queryRaw.mock.calls[0] as unknown[];
      expect(revokeArgs.slice(1)).toEqual(['s-1', 's-1']);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.session.revoked',
        expect.objectContaining({ userId: 'u-1', payload: { sessionId: 's-1', reason: 'logout' } }),
      );
    });

    it("denylists the revoked session's currentJti (E2-T28) so its access token stops working immediately, not just at natural expiry", async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-1',
        sessionId: 's-1',
      });
      appPrisma.$queryRaw.mockResolvedValue([{ currentJti: 'jti-abc' }]);

      await authService.logout('raw-token', 'u-1');

      expect(jtiDenylist.add).toHaveBeenCalledWith('jti-abc');
    });

    it('does not attempt to denylist anything when the revoked session had no currentJti on record', async () => {
      appPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-1',
        sessionId: 's-1',
      });
      appPrisma.$queryRaw.mockResolvedValue([{ currentJti: null }]);

      await authService.logout('raw-token', 'u-1');

      expect(jtiDenylist.add).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllSessions', () => {
    it('issues a single raw-SQL statement scoped by userId (not sessionId), and publishes one identity.session.revoked per affected session', async () => {
      appPrisma.$queryRaw.mockResolvedValue([
        { id: 's-1', currentJti: 'jti-1' },
        { id: 's-2', currentJti: 'jti-2' },
      ]);

      await authService.revokeAllSessions('u-1', 'password_reset');

      expect(appPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const revokeArgs = appPrisma.$queryRaw.mock.calls[0] as unknown[];
      expect(revokeArgs.slice(1)).toEqual(['u-1', 'u-1']);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.session.revoked',
        expect.objectContaining({
          userId: 'u-1',
          payload: { sessionId: 's-1', reason: 'password_reset' },
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.session.revoked',
        expect.objectContaining({
          userId: 'u-1',
          payload: { sessionId: 's-2', reason: 'password_reset' },
        }),
      );
    });

    it("denylists every revoked session's currentJti (E2-T28), not just the first", async () => {
      appPrisma.$queryRaw.mockResolvedValue([
        { id: 's-1', currentJti: 'jti-1' },
        { id: 's-2', currentJti: null },
        { id: 's-3', currentJti: 'jti-3' },
      ]);

      await authService.revokeAllSessions('u-1', 'password_reset');

      expect(jtiDenylist.add).toHaveBeenCalledTimes(2);
      expect(jtiDenylist.add).toHaveBeenCalledWith('jti-1');
      expect(jtiDenylist.add).toHaveBeenCalledWith('jti-3');
    });

    it('publishes nothing when no session was actually revoked', async () => {
      appPrisma.$queryRaw.mockResolvedValue([]);
      await authService.revokeAllSessions('u-1', 'password_reset');
      expect(events.publish).not.toHaveBeenCalledWith(
        'identity.session.revoked',
        expect.anything(),
      );
      expect(jtiDenylist.add).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    it('returns EMAIL_SENT (no-op) when no account exists for the email — enumeration resistance', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.requestPasswordReset('nobody@test.local');

      expect(result).toEqual({ status: 'EMAIL_SENT' });
      expect(servicePrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('returns OAUTH_ACCOUNT with the linked providers for an OAuth-only account, without creating a token', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow({ passwordHash: null }));
      servicePrisma.oAuthAccount.findMany.mockResolvedValue([{ provider: 'GOOGLE' }]);

      const result = await authService.requestPasswordReset('user@test.local');

      expect(result).toEqual({ status: 'OAUTH_ACCOUNT', providers: ['GOOGLE'] });
      expect(servicePrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a single-use PasswordResetToken and returns EMAIL_SENT for a real password account — identical response shape to the no-account case', async () => {
      servicePrisma.user.findUnique.mockResolvedValue(makeUserRow());
      servicePrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-new' });

      const result = await authService.requestPasswordReset('user@test.local');

      expect(result).toEqual({ status: 'EMAIL_SENT' });
      expect(servicePrisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'u-1' }) }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.password.reset_requested',
        expect.objectContaining({ userId: 'u-1' }),
      );
    });
  });

  describe('confirmPasswordReset', () => {
    const existingToken = {
      id: 'prt-1',
      userId: 'u-1',
      tokenHash: 'irrelevant-for-the-mock',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      usedAt: null,
    };

    it('throws UnauthorizedException when no token matches the hash', async () => {
      servicePrisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        authService.confirmPasswordReset('unknown-raw-token', 'new password 12+'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for an expired token without attempting the atomic claim', async () => {
      servicePrisma.passwordResetToken.findUnique.mockResolvedValue({
        ...existingToken,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        authService.confirmPasswordReset('raw-token', 'new password 12+'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(servicePrisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for an already-used token without attempting the atomic claim', async () => {
      servicePrisma.passwordResetToken.findUnique.mockResolvedValue({
        ...existingToken,
        usedAt: new Date(),
      });
      await expect(
        authService.confirmPasswordReset('raw-token', 'new password 12+'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(servicePrisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException on a lost claim race (claim.count === 0) without updating the password', async () => {
      servicePrisma.passwordResetToken.findUnique.mockResolvedValue(existingToken);
      servicePrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        authService.confirmPasswordReset('raw-token', 'new password 12+'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(servicePrisma.user.update).not.toHaveBeenCalled();
    });

    it('on a won claim: hashes the new password, bumps tokensValidAfter, and revokes every session for the user', async () => {
      servicePrisma.passwordResetToken.findUnique.mockResolvedValue(existingToken);
      servicePrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      appPrisma.$queryRaw.mockResolvedValue([{ id: 's-1' }]);
      (utils.hashPassword as jest.Mock).mockResolvedValue('new-hashed-password');

      await authService.confirmPasswordReset('raw-token', 'new password 12+');

      expect(servicePrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: {
          passwordHash: 'new-hashed-password',
          tokensValidAfter: expect.any(Date) as unknown as Date,
        },
      });
      // revokeAllSessions (E2-T19/T20) is a single raw-SQL statement — see auth.service.ts.
      expect(appPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const revokeArgs = appPrisma.$queryRaw.mock.calls[0] as unknown[];
      expect(revokeArgs.slice(1)).toEqual(['u-1', 'u-1']);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.session.revoked',
        expect.objectContaining({
          userId: 'u-1',
          payload: { sessionId: 's-1', reason: 'password_reset' },
        }),
      );
    });
  });
});
