import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@linguaai/database';

import type { DomainEventPublisher } from '../../events/index.js';
import type { AuthService } from './auth.service.js';
import { OAuthService, type OAuthProfile } from './oauth.service.js';

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'user@test.local',
    passwordHash: null,
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

describe('OAuthService', () => {
  let appPrisma: {
    oAuthState: { create: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock };
  };
  let servicePrisma: {
    oAuthAccount: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { issueSession: jest.Mock };
  let events: { publish: jest.Mock };
  let oauthService: OAuthService;

  beforeEach(() => {
    appPrisma = { oAuthState: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() } };
    servicePrisma = {
      oAuthAccount: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: typeof servicePrisma) => Promise<unknown>) =>
          fn(servicePrisma),
        ),
    };
    authService = { issueSession: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    oauthService = new OAuthService(
      appPrisma as unknown as PrismaClient,
      servicePrisma as unknown as PrismaClient,
      authService as unknown as AuthService,
      events as unknown as DomainEventPublisher,
    );
  });

  describe('createState', () => {
    it('persists a hashed state row scoped to the provider, with no linkingUserId by default, and returns the raw value', async () => {
      appPrisma.oAuthState.create.mockResolvedValue({ id: 's-1' });

      const raw = await oauthService.createState('GOOGLE');

      expect(typeof raw).toBe('string');
      expect(raw.length).toBeGreaterThan(0);
      expect(appPrisma.oAuthState.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'GOOGLE',
            stateHash: expect.any(String) as unknown as string,
            linkingUserId: null,
          }),
        }),
      );
      // The raw value is never what gets persisted.
      const persistedHash = (
        appPrisma.oAuthState.create.mock.calls[0][0].data as { stateHash: string }
      ).stateHash;
      expect(persistedHash).not.toBe(raw);
    });

    it('tags the state with linkingUserId when provided (E2-T12)', async () => {
      appPrisma.oAuthState.create.mockResolvedValue({ id: 's-1' });

      await oauthService.createState('GOOGLE', 'u-1');

      expect(appPrisma.oAuthState.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ linkingUserId: 'u-1' }) }),
      );
    });
  });

  describe('consumeState', () => {
    it('throws UnauthorizedException when no state is provided', async () => {
      await expect(oauthService.consumeState('GOOGLE', undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(appPrisma.oAuthState.updateMany).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the atomic claim matches zero rows (missing/expired/reused/wrong-provider)', async () => {
      appPrisma.oAuthState.updateMany.mockResolvedValue({ count: 0 });
      await expect(oauthService.consumeState('GOOGLE', 'some-raw-state')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('returns linkingUserId: null for an ordinary (non-linking) state', async () => {
      appPrisma.oAuthState.updateMany.mockResolvedValue({ count: 1 });
      appPrisma.oAuthState.findUnique.mockResolvedValue({ linkingUserId: null });

      await expect(oauthService.consumeState('GOOGLE', 'some-raw-state')).resolves.toEqual({
        linkingUserId: null,
      });
      expect(appPrisma.oAuthState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ provider: 'GOOGLE', usedAt: null }),
          data: { usedAt: expect.any(Date) as unknown as Date },
        }),
      );
    });

    it('returns the tagged linkingUserId for a linking-flow state (E2-T12)', async () => {
      appPrisma.oAuthState.updateMany.mockResolvedValue({ count: 1 });
      appPrisma.oAuthState.findUnique.mockResolvedValue({ linkingUserId: 'u-1' });

      await expect(oauthService.consumeState('GOOGLE', 'some-raw-state')).resolves.toEqual({
        linkingUserId: 'u-1',
      });
    });
  });

  describe('handleProviderProfile', () => {
    const profile: OAuthProfile = {
      provider: 'GOOGLE',
      providerAccountId: 'google-sub-123',
      email: 'new@test.local',
      displayName: 'New User',
    };

    it('authenticates immediately when (provider, providerAccountId) already has a linked OAuthAccount', async () => {
      servicePrisma.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oa-1',
        user: makeUserRow({ email: profile.email }),
      });
      authService.issueSession.mockResolvedValue({ accessToken: 'jwt', refreshToken: 'raw-rt' });

      const outcome = await oauthService.handleProviderProfile(profile, null, null);

      expect(outcome).toEqual({
        kind: 'authenticated',
        accessToken: 'jwt',
        refreshToken: 'raw-rt',
        user: expect.objectContaining({ email: profile.email }) as unknown,
      });
      expect(servicePrisma.user.findUnique).not.toHaveBeenCalled();
      expect(servicePrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the linked account is SUSPENDED', async () => {
      servicePrisma.oAuthAccount.findUnique.mockResolvedValue({
        id: 'oa-1',
        user: makeUserRow({ status: 'SUSPENDED' }),
      });

      await expect(oauthService.handleProviderProfile(profile, null, null)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns link_required — never auto-links — when no OAuthAccount exists but the email already belongs to another User', async () => {
      servicePrisma.oAuthAccount.findUnique.mockResolvedValue(null);
      servicePrisma.user.findUnique.mockResolvedValue(
        makeUserRow({ email: profile.email, passwordHash: '$argon2id$fake' }),
      );

      const outcome = await oauthService.handleProviderProfile(profile, null, null);

      expect(outcome).toEqual({ kind: 'link_required', email: profile.email });
      expect(servicePrisma.$transaction).not.toHaveBeenCalled();
      expect(authService.issueSession).not.toHaveBeenCalled();
    });

    it('creates a new User + OAuthAccount + TOS/PRIVACY_POLICY consent, then authenticates, when genuinely new', async () => {
      servicePrisma.oAuthAccount.findUnique.mockResolvedValue(null);
      servicePrisma.user.findUnique.mockResolvedValue(null);
      const createdUser = makeUserRow({
        id: 'u-new',
        email: profile.email,
        displayName: profile.displayName,
      });
      const txUserCreate = jest.fn().mockResolvedValue(createdUser);
      const txOAuthAccountCreate = jest.fn().mockResolvedValue({ id: 'oa-new' });
      const txConsentCreateMany = jest.fn().mockResolvedValue({ count: 2 });
      servicePrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { create: txUserCreate },
          oAuthAccount: { create: txOAuthAccountCreate },
          consentRecord: { createMany: txConsentCreateMany },
        }),
      );
      authService.issueSession.mockResolvedValue({ accessToken: 'jwt', refreshToken: 'raw-rt' });

      const outcome = await oauthService.handleProviderProfile(profile, 'jest-agent', '1.2.3.4');

      expect(txUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: profile.email,
            passwordHash: null,
            status: 'ACTIVE',
          }),
        }),
      );
      expect(txOAuthAccountCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u-new',
            provider: 'GOOGLE',
            providerAccountId: profile.providerAccountId,
          }),
        }),
      );
      const consentTypes = (
        txConsentCreateMany.mock.calls[0][0].data as { consentType: string }[]
      ).map((c) => c.consentType);
      expect(consentTypes.sort()).toEqual(['PRIVACY_POLICY', 'TOS']);
      expect(authService.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u-new' }),
        'jest-agent',
        '1.2.3.4',
      );
      expect(outcome.kind).toBe('authenticated');
      expect(events.publish).toHaveBeenCalledWith(
        'identity.user.registered',
        expect.objectContaining({ userId: 'u-new', payload: { signupSource: 'google' } }),
      );
      const consentEventTypes = events.publish.mock.calls
        .filter(([type]: [string]) => type === 'identity.consent.recorded')
        .map(
          ([, params]: [string, { payload: { consentType: string } }]) =>
            params.payload.consentType,
        );
      expect(consentEventTypes.sort()).toEqual(['PRIVACY_POLICY', 'TOS']);
    });
  });

  describe('linkProviderToUser', () => {
    const profile: OAuthProfile = {
      provider: 'GOOGLE',
      providerAccountId: 'google-sub-456',
      email: 'linker@test.local',
      displayName: 'Linker',
    };

    it('creates an OAuthAccount for the given userId and returns its public shape', async () => {
      const linkedAt = new Date('2026-01-01T00:00:00.000Z');
      servicePrisma.oAuthAccount.create.mockResolvedValue({
        provider: 'GOOGLE',
        providerAccountId: profile.providerAccountId,
        linkedAt,
      });

      const result = await oauthService.linkProviderToUser('u-1', profile);

      expect(servicePrisma.oAuthAccount.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', provider: 'GOOGLE', providerAccountId: profile.providerAccountId },
      });
      expect(result).toEqual({
        provider: 'GOOGLE',
        providerAccountId: profile.providerAccountId,
        linkedAt: linkedAt.toISOString(),
      });
      expect(events.publish).toHaveBeenCalledWith('identity.oauth.linked', {
        userId: 'u-1',
        payload: { provider: 'GOOGLE' },
      });
    });

    it("writes an AuditLog entry for the link (Part 9B's required-events list names OAuth account linking explicitly)", async () => {
      servicePrisma.oAuthAccount.create.mockResolvedValue({
        id: 'oauth-acct-1',
        provider: 'GOOGLE',
        providerAccountId: profile.providerAccountId,
        linkedAt: new Date(),
      });

      await oauthService.linkProviderToUser('u-1', profile);

      expect(servicePrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: 'u-1',
            action: 'user.oauth_account.linked',
            targetType: 'OAuthAccount',
            targetId: 'oauth-acct-1',
          }),
        }),
      );
    });

    it('translates a unique-constraint violation (P2002) into ConflictException — whether already linked to this user or a different one', async () => {
      servicePrisma.oAuthAccount.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(oauthService.linkProviderToUser('u-1', profile)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows any other error unchanged', async () => {
      const dbError = new Error('connection reset');
      servicePrisma.oAuthAccount.create.mockRejectedValue(dbError);

      await expect(oauthService.linkProviderToUser('u-1', profile)).rejects.toBe(dbError);
    });
  });

  describe('handleResolvedProfile', () => {
    const profile: OAuthProfile = {
      provider: 'GOOGLE',
      providerAccountId: 'google-sub-789',
      email: 'either-path@test.local',
      displayName: 'Either Path',
    };

    it('routes to linkProviderToUser (kind: linked) when linkingUserId is set, never touching login/registration logic', async () => {
      const linkedAt = new Date('2026-01-01T00:00:00.000Z');
      servicePrisma.oAuthAccount.create.mockResolvedValue({
        provider: 'GOOGLE',
        providerAccountId: profile.providerAccountId,
        linkedAt,
      });

      const outcome = await oauthService.handleResolvedProfile(profile, 'u-1', null, null);

      expect(outcome).toEqual({
        kind: 'linked',
        provider: 'GOOGLE',
        providerAccountId: profile.providerAccountId,
        linkedAt: linkedAt.toISOString(),
      });
      expect(servicePrisma.oAuthAccount.findUnique).not.toHaveBeenCalled();
      expect(authService.issueSession).not.toHaveBeenCalled();
    });

    it('routes to handleProviderProfile (ordinary login/register) when linkingUserId is null', async () => {
      servicePrisma.oAuthAccount.findUnique.mockResolvedValue(null);
      servicePrisma.user.findUnique.mockResolvedValue(null);
      servicePrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: {
            create: jest.fn().mockResolvedValue(makeUserRow({ id: 'u-new', email: profile.email })),
          },
          oAuthAccount: { create: jest.fn().mockResolvedValue({ id: 'oa-new' }) },
          consentRecord: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        }),
      );
      authService.issueSession.mockResolvedValue({ accessToken: 'jwt', refreshToken: 'raw-rt' });

      const outcome = await oauthService.handleResolvedProfile(
        profile,
        null,
        'jest-agent',
        '1.2.3.4',
      );

      expect(outcome.kind).toBe('authenticated');
      expect(servicePrisma.oAuthAccount.create).not.toHaveBeenCalled();
    });
  });
});
