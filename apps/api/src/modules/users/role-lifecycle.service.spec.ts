import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@linguaai/database';

import type { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { RoleLifecycleService } from './role-lifecycle.service.js';

function governanceError(message: string): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: '6.19.3' });
}

describe('RoleLifecycleService', () => {
  let appPrisma: {
    user: { findUnique: jest.Mock };
    roleChangeRequest: { create: jest.Mock; findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    organizationMembership: { findUnique: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let events: { publish: jest.Mock };
  let service: RoleLifecycleService;

  const admin: RequestUser = {
    userId: 'admin-1',
    role: 'ADMIN',
    organizationId: null,
    orgRole: null,
  };
  const orgAdmin: RequestUser = {
    userId: 'org-admin-1',
    role: 'USER',
    organizationId: 'org-1',
    orgRole: 'ENTERPRISE_ADMIN',
  };
  const plainMember: RequestUser = {
    userId: 'member-1',
    role: 'USER',
    organizationId: 'org-1',
    orgRole: 'MEMBER',
  };

  beforeEach(() => {
    appPrisma = {
      user: { findUnique: jest.fn() },
      roleChangeRequest: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      organizationMembership: { findUnique: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new RoleLifecycleService(
      appPrisma as unknown as PrismaClient,
      events as unknown as DomainEventPublisher,
    );
  });

  describe('initiateRoleChange', () => {
    it('throws NotFoundException when the target user does not exist', async () => {
      appPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.initiateRoleChange(admin, 'target-1', 'TEACHER')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException when the target already has the requested role', async () => {
      appPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', role: 'TEACHER' });
      await expect(service.initiateRoleChange(admin, 'target-1', 'TEACHER')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("derives fromRole from the target's actual current role, never a client-supplied value (there is no such parameter at all)", async () => {
      appPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', role: 'USER' });
      appPrisma.roleChangeRequest.create.mockResolvedValue({ id: 'rcr-1' });
      appPrisma.roleChangeRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
        fromRole: 'USER',
        toRole: 'TEACHER',
        requestedBy: admin.userId,
        approvedBy: admin.userId,
        status: 'APPROVED',
        expiresAt: new Date(),
        createdAt: new Date(),
        resolvedAt: new Date(),
      });

      await service.initiateRoleChange(admin, 'target-1', 'TEACHER');

      expect(appPrisma.roleChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromRole: 'USER',
            toRole: 'TEACHER',
            requestedBy: admin.userId,
          }),
        }),
      );
    });

    it('auto-approves immediately (single-party) for a non-ADMIN-involving change', async () => {
      appPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', role: 'USER' });
      appPrisma.roleChangeRequest.create.mockResolvedValue({ id: 'rcr-1' });
      appPrisma.roleChangeRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
        fromRole: 'USER',
        toRole: 'TEACHER',
        requestedBy: admin.userId,
        approvedBy: admin.userId,
        status: 'APPROVED',
        expiresAt: new Date(),
        createdAt: new Date(),
        resolvedAt: new Date(),
      });

      const result = await service.initiateRoleChange(admin, 'target-1', 'TEACHER');

      expect(appPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const callArgs = appPrisma.$executeRaw.mock.calls[0] as unknown[];
      expect(callArgs.slice(1)).toEqual(['rcr-1', admin.userId, expect.any(String), false]);
      expect(result.status).toBe('APPROVED');
      expect(events.publish).toHaveBeenCalledWith(
        'identity.role.change_requested',
        expect.objectContaining({
          userId: 'target-1',
          payload: expect.objectContaining({
            toRole: 'TEACHER',
            requiresApproval: false,
          }) as unknown,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.role.change_approved',
        expect.objectContaining({
          userId: 'target-1',
          payload: expect.objectContaining({ approvedBy: admin.userId }) as unknown,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.role.changed',
        expect.objectContaining({
          userId: 'target-1',
          payload: expect.objectContaining({ changedBy: admin.userId }) as unknown,
        }),
      );
    });

    it('does NOT auto-approve when promoting to ADMIN — stays PENDING for two-person approval', async () => {
      appPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', role: 'USER' });
      appPrisma.roleChangeRequest.create.mockResolvedValue({ id: 'rcr-1' });
      appPrisma.roleChangeRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
        fromRole: 'USER',
        toRole: 'ADMIN',
        requestedBy: admin.userId,
        approvedBy: null,
        status: 'PENDING',
        expiresAt: new Date(),
        createdAt: new Date(),
        resolvedAt: null,
      });

      const result = await service.initiateRoleChange(admin, 'target-1', 'ADMIN');

      expect(appPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
      expect(events.publish).toHaveBeenCalledWith(
        'identity.role.change_requested',
        expect.objectContaining({
          payload: expect.objectContaining({ requiresApproval: true }) as unknown,
        }),
      );
      // Not yet approved — approved/changed must not fire until a second ADMIN acts.
      expect(events.publish).not.toHaveBeenCalledWith(
        'identity.role.change_approved',
        expect.anything(),
      );
      expect(events.publish).not.toHaveBeenCalledWith('identity.role.changed', expect.anything());
    });

    it('does NOT auto-approve when demoting away from ADMIN', async () => {
      appPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', role: 'ADMIN' });
      appPrisma.roleChangeRequest.create.mockResolvedValue({ id: 'rcr-1' });
      appPrisma.roleChangeRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
        fromRole: 'ADMIN',
        toRole: 'USER',
        requestedBy: admin.userId,
        approvedBy: null,
        status: 'PENDING',
        expiresAt: new Date(),
        createdAt: new Date(),
        resolvedAt: null,
      });

      await service.initiateRoleChange(admin, 'target-1', 'USER');

      expect(appPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('sets expiresAt 72 hours out', async () => {
      appPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', role: 'ADMIN' });
      appPrisma.roleChangeRequest.create.mockResolvedValue({ id: 'rcr-1' });
      appPrisma.roleChangeRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
        fromRole: 'ADMIN',
        toRole: 'USER',
        requestedBy: admin.userId,
        approvedBy: null,
        status: 'PENDING',
        expiresAt: new Date(),
        createdAt: new Date(),
        resolvedAt: null,
      });

      const before = Date.now();
      await service.initiateRoleChange(admin, 'target-1', 'USER');

      const createArgs = appPrisma.roleChangeRequest.create.mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      const deltaMs = createArgs.data.expiresAt.getTime() - before;
      expect(deltaMs).toBeGreaterThan(71.9 * 3600 * 1000);
      expect(deltaMs).toBeLessThan(72.1 * 3600 * 1000);
    });
  });

  describe('approveRoleChange', () => {
    it('throws NotFoundException when the request does not exist', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue(null);
      await expect(service.approveRoleChange(admin, 'target-1', 'rcr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(appPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the request targets a different user than the path id', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'someone-else',
      });
      await expect(service.approveRoleChange(admin, 'target-1', 'rcr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('calls approve_role_change with require_different_approver=true', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
      });
      appPrisma.roleChangeRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
        fromRole: 'USER',
        toRole: 'ADMIN',
        requestedBy: 'someone-else',
        approvedBy: admin.userId,
        status: 'APPROVED',
        expiresAt: new Date(),
        createdAt: new Date(),
        resolvedAt: new Date(),
      });

      await service.approveRoleChange(admin, 'target-1', 'rcr-1');

      const callArgs = appPrisma.$executeRaw.mock.calls[0] as unknown[];
      expect(callArgs.slice(1)).toEqual(['rcr-1', admin.userId, expect.any(String), true]);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.role.change_approved',
        expect.objectContaining({
          userId: 'target-1',
          payload: expect.objectContaining({ approvedBy: admin.userId }) as unknown,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.role.changed',
        expect.objectContaining({
          userId: 'target-1',
          payload: expect.objectContaining({ changedBy: admin.userId }) as unknown,
        }),
      );
    });

    it('translates cannot_demote_last_platform_admin into ConflictException', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
      });
      appPrisma.$executeRaw.mockRejectedValue(governanceError('cannot_demote_last_platform_admin'));

      await expect(service.approveRoleChange(admin, 'target-1', 'rcr-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('translates role_change_request_not_approvable into ConflictException', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
      });
      appPrisma.$executeRaw.mockRejectedValue(
        governanceError('role_change_request_not_approvable'),
      );

      await expect(service.approveRoleChange(admin, 'target-1', 'rcr-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('translates approver_not_authorized into ForbiddenException', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
      });
      appPrisma.$executeRaw.mockRejectedValue(governanceError('approver_not_authorized'));

      await expect(service.approveRoleChange(admin, 'target-1', 'rcr-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rethrows an unrelated error unchanged', async () => {
      appPrisma.roleChangeRequest.findUnique.mockResolvedValue({
        id: 'rcr-1',
        targetUserId: 'target-1',
      });
      const unrelated = new Error('connection reset');
      appPrisma.$executeRaw.mockRejectedValue(unrelated);

      await expect(service.approveRoleChange(admin, 'target-1', 'rcr-1')).rejects.toBe(unrelated);
    });
  });

  describe('changeOrgMemberRole', () => {
    it("throws NotFoundException for a caller who is neither platform ADMIN nor that org's ENTERPRISE_ADMIN", async () => {
      await expect(
        service.changeOrgMemberRole(plainMember, 'org-1', 'target-1', 'ENTERPRISE_ADMIN'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(appPrisma.organizationMembership.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target is not a member of the org', async () => {
      appPrisma.organizationMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.changeOrgMemberRole(orgAdmin, 'org-1', 'target-1', 'ENTERPRISE_ADMIN'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("calls set_org_role with the caller's own id as actor", async () => {
      appPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'membership-1' });

      await service.changeOrgMemberRole(orgAdmin, 'org-1', 'target-1', 'ENTERPRISE_ADMIN');

      const callArgs = appPrisma.$executeRaw.mock.calls[0] as unknown[];
      expect(callArgs.slice(1)).toEqual([
        'membership-1',
        'ENTERPRISE_ADMIN',
        orgAdmin.userId,
        expect.any(String),
      ]);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.organization.membership_changed',
        expect.objectContaining({
          userId: 'target-1',
          tenantId: 'org-1',
          payload: { organizationId: 'org-1', userId: 'target-1', action: 'role_changed' },
        }),
      );
    });

    it('allows a platform admin to act cross-org', async () => {
      appPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      await expect(
        service.changeOrgMemberRole(admin, 'org-1', 'target-1', 'MEMBER'),
      ).resolves.toBeUndefined();
    });

    it('translates cannot_demote_last_enterprise_admin into ConflictException', async () => {
      appPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      appPrisma.$executeRaw.mockRejectedValue(
        governanceError('cannot_demote_last_enterprise_admin'),
      );

      await expect(
        service.changeOrgMemberRole(orgAdmin, 'org-1', 'target-1', 'MEMBER'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('translates actor_not_authorized_for_organization into ForbiddenException', async () => {
      appPrisma.organizationMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      appPrisma.$executeRaw.mockRejectedValue(
        governanceError('actor_not_authorized_for_organization'),
      );

      await expect(
        service.changeOrgMemberRole(orgAdmin, 'org-1', 'target-1', 'MEMBER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
