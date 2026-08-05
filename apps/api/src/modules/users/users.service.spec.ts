import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import type { DomainEventPublisher } from '../../events/index.js';
import type { AuthService } from '../auth/auth.service.js';
import { UsersService } from './users.service.js';

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    userId: 'u-1',
    deviceLabel: 'jest-agent',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-01-02T00:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'user@test.local',
    passwordHash: 'hash',
    displayName: 'Original Name',
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

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u-1',
    nativeLanguage: 'es',
    targetLanguages: ['en'],
    goalType: 'GENERAL_FLUENCY',
    dailyTimeCommitmentMinutes: 15,
    ...overrides,
  };
}

describe('UsersService', () => {
  let appPrisma: {
    session: { findMany: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
    userProfile: { findUnique: jest.Mock };
  };
  let tx: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    organizationMembership: { findUnique: jest.Mock; delete: jest.Mock };
    oAuthAccount: { deleteMany: jest.Mock };
    userProfile: { deleteMany: jest.Mock };
    deviceToken: { deleteMany: jest.Mock };
    refreshToken: { deleteMany: jest.Mock };
    session: { deleteMany: jest.Mock };
    passwordResetToken: { deleteMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let servicePrisma: { $transaction: jest.Mock };
  let authService: { revokeSession: jest.Mock };
  let events: { publish: jest.Mock };
  let usersService: UsersService;

  beforeEach(() => {
    appPrisma = {
      session: { findMany: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      userProfile: { findUnique: jest.fn() },
    };
    tx = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(makeUserRow({ status: 'DELETED' })),
      },
      organizationMembership: { findUnique: jest.fn(), delete: jest.fn() },
      oAuthAccount: { deleteMany: jest.fn() },
      userProfile: { deleteMany: jest.fn() },
      deviceToken: { deleteMany: jest.fn() },
      refreshToken: { deleteMany: jest.fn() },
      session: { deleteMany: jest.fn() },
      passwordResetToken: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    servicePrisma = { $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)) };
    authService = { revokeSession: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    usersService = new UsersService(
      appPrisma as unknown as PrismaClient,
      servicePrisma as unknown as PrismaClient,
      authService as unknown as AuthService,
      events as unknown as DomainEventPublisher,
    );
  });

  describe('getCurrentUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      appPrisma.user.findUnique.mockResolvedValue(null);
      await expect(usersService.getCurrentUser('u-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the public user shape with profile: null when no UserProfile row exists', async () => {
      appPrisma.user.findUnique.mockResolvedValue(makeUserRow());
      appPrisma.userProfile.findUnique.mockResolvedValue(null);

      const result = await usersService.getCurrentUser('u-1');

      expect(result.profile).toBeNull();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('mfaSecret');
    });

    it('includes the mapped UserProfile when one exists', async () => {
      appPrisma.user.findUnique.mockResolvedValue(makeUserRow());
      appPrisma.userProfile.findUnique.mockResolvedValue(makeProfileRow());

      const result = await usersService.getCurrentUser('u-1');

      expect(result.profile).toEqual(
        expect.objectContaining({ nativeLanguage: 'es', goalType: 'GENERAL_FLUENCY' }),
      );
    });
  });

  describe('updateProfile', () => {
    it('only includes the fields provided in the update call', async () => {
      appPrisma.user.update.mockResolvedValue(makeUserRow({ displayName: 'New Name' }));

      await usersService.updateProfile('u-1', { displayName: 'New Name' });

      expect(appPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { displayName: 'New Name' },
      });
    });

    it('returns the updated public user shape', async () => {
      appPrisma.user.update.mockResolvedValue(makeUserRow({ displayName: 'New Name' }));

      const result = await usersService.updateProfile('u-1', { displayName: 'New Name' });

      expect(result.displayName).toBe('New Name');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('requestDeletion', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      tx.user.findUnique.mockResolvedValue(null);
      await expect(usersService.requestDeletion('u-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the account is already DELETED', async () => {
      tx.user.findUnique.mockResolvedValue(makeUserRow({ status: 'DELETED' }));
      await expect(usersService.requestDeletion('u-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('hard-deletes owned auxiliary entities, anonymizes the User row (never a hard delete), and writes exactly one AuditLog row', async () => {
      tx.user.findUnique.mockResolvedValue(makeUserRow());

      const result = await usersService.requestDeletion('u-1');

      expect(tx.oAuthAccount.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
      expect(tx.userProfile.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
      expect(tx.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
      expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
      expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
      expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          status: 'DELETED',
          passwordHash: null,
          mfaSecret: null,
          organizationId: null,
        }),
      });

      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'account.deletion.requested',
            actorUserId: 'u-1',
            targetId: 'u-1',
          }),
        }),
      );
      expect(result.status).toBe('ACCEPTED');
      expect(events.publish).toHaveBeenCalledWith(
        'account.deletion.requested',
        expect.objectContaining({
          userId: 'u-1',
          tenantId: null,
          payload: expect.objectContaining({ userId: 'u-1' }) as unknown,
        }),
      );
    });

    it('removes the OrganizationMembership row when the user belongs to an org', async () => {
      tx.user.findUnique.mockResolvedValue(makeUserRow({ organizationId: 'org-1' }));
      tx.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        userId: 'u-1',
        organizationId: 'org-1',
        orgRole: 'MEMBER',
      });

      await usersService.requestDeletion('u-1');

      expect(tx.organizationMembership.delete).toHaveBeenCalledWith({ where: { id: 'mem-1' } });
    });

    it('skips the membership lookup entirely for an org-less user', async () => {
      tx.user.findUnique.mockResolvedValue(makeUserRow({ organizationId: null }));
      await usersService.requestDeletion('u-1');
      expect(tx.organizationMembership.findUnique).not.toHaveBeenCalled();
    });

    it("translates the last-ENTERPRISE_ADMIN trigger's exception into 409, same pattern as OrganizationsService.removeMember", async () => {
      tx.user.findUnique.mockResolvedValue(makeUserRow({ organizationId: 'org-1' }));
      tx.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        userId: 'u-1',
        organizationId: 'org-1',
        orgRole: 'ENTERPRISE_ADMIN',
      });
      tx.organizationMembership.delete.mockRejectedValue(
        new Error('cannot_remove_last_enterprise_admin: blocked'),
      );

      await expect(usersService.requestDeletion('u-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows an unrecognized error unchanged', async () => {
      tx.user.findUnique.mockRejectedValue(new Error('unexpected database error'));
      await expect(usersService.requestDeletion('u-1')).rejects.toThrow(
        'unexpected database error',
      );
    });
  });

  describe('listSessions', () => {
    it("filters to the caller's own non-revoked sessions and maps to the DTO shape", async () => {
      appPrisma.session.findMany.mockResolvedValue([makeSessionRow()]);

      const result = await usersService.listSessions('u-1');

      expect(appPrisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-1', revokedAt: null } }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: '11111111-1111-1111-1111-111111111111',
          deviceLabel: 'jest-agent',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-02T00:00:00.000Z',
          revokedAt: null,
        }),
      ]);
    });
  });

  describe('revokeSession', () => {
    it('throws NotFoundException for a malformed (non-UUID) id without querying the database', async () => {
      await expect(usersService.revokeSession('u-1', 'not-a-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(appPrisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the session does not exist', async () => {
      appPrisma.session.findUnique.mockResolvedValue(null);
      await expect(
        usersService.revokeSession('u-1', '11111111-1111-1111-1111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException (not Forbidden — no existence leak) when the session belongs to someone else', async () => {
      appPrisma.session.findUnique.mockResolvedValue(makeSessionRow({ userId: 'someone-else' }));
      await expect(
        usersService.revokeSession('u-1', '11111111-1111-1111-1111-111111111111'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authService.revokeSession).not.toHaveBeenCalled();
    });

    it('delegates to AuthService.revokeSession when the session is owned by the caller', async () => {
      appPrisma.session.findUnique.mockResolvedValue(makeSessionRow());
      await usersService.revokeSession('u-1', '11111111-1111-1111-1111-111111111111');
      expect(authService.revokeSession).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'u-1',
        'user_initiated',
      );
    });
  });
});
