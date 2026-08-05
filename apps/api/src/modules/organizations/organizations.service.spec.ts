import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@linguaai/database';
import type {
  AddOrganizationMembersRequest,
  CreateOrganizationRequest,
  OrganizationMemberInput,
} from '@linguaai/validation/identity';

import type { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { OrganizationsService } from './organizations.service.js';

function makeMemberInput(
  overrides: Partial<OrganizationMemberInput> = {},
): OrganizationMemberInput {
  return {
    email: 'new-member@test.local',
    displayName: 'New Member',
    locale: 'en-US',
    timezone: 'UTC',
    ...overrides,
  };
}

describe('OrganizationsService', () => {
  let appPrisma: {
    organization: { findUnique: jest.Mock };
    organizationMembership: { findMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let servicePrisma: { $transaction: jest.Mock };
  let tx: {
    organization: { create: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    organizationMembership: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let events: { publish: jest.Mock };
  let service: OrganizationsService;

  const platformAdmin: RequestUser = {
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
  const outsider: RequestUser = {
    userId: 'outsider-1',
    role: 'USER',
    organizationId: 'org-2',
    orgRole: 'ENTERPRISE_ADMIN',
  };

  beforeEach(() => {
    appPrisma = {
      organization: { findUnique: jest.fn() },
      organizationMembership: { findMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    tx = {
      organization: { create: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      organizationMembership: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    servicePrisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new OrganizationsService(
      appPrisma as unknown as PrismaClient,
      servicePrisma as unknown as PrismaClient,
      events as unknown as DomainEventPublisher,
    );
  });

  describe('createOrganization', () => {
    const dto: CreateOrganizationRequest = {
      name: 'Acme Corp',
      firstAdmin: makeMemberInput({ email: 'first-admin@test.local' }),
    };

    it("creates the org and designates firstAdmin as ENTERPRISE_ADMIN, creating a new User (passwordHash: null) since the email doesn't exist yet", async () => {
      tx.organization.create.mockResolvedValue({
        id: 'org-new',
        name: 'Acme Corp',
        dataRegion: null,
        seatCount: 0,
        createdAt: new Date('2026-01-01'),
      });
      tx.user.findUnique.mockResolvedValue(null);
      tx.user.create.mockResolvedValue({
        id: 'user-new',
        email: 'first-admin@test.local',
        displayName: 'New Member',
      });

      const result = await service.createOrganization(platformAdmin, dto);

      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'first-admin@test.local',
            passwordHash: null,
            organizationId: 'org-new',
          }),
        }),
      );
      expect(tx.organizationMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-new', organizationId: 'org-new', orgRole: 'ENTERPRISE_ADMIN' },
      });
      expect(result.members).toEqual([
        {
          userId: 'user-new',
          email: 'first-admin@test.local',
          displayName: 'New Member',
          orgRole: 'ENTERPRISE_ADMIN',
        },
      ]);
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'organization.created',
            actorUserId: platformAdmin.userId,
          }),
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.organization.membership_changed',
        expect.objectContaining({
          userId: 'user-new',
          tenantId: 'org-new',
          payload: { organizationId: 'org-new', userId: 'user-new', action: 'added' },
        }),
      );
    });

    it('attaches an existing, org-less user instead of creating a new one', async () => {
      tx.organization.create.mockResolvedValue({
        id: 'org-new',
        name: 'Acme Corp',
        dataRegion: null,
        seatCount: 0,
        createdAt: new Date(),
      });
      tx.user.findUnique.mockResolvedValue({
        id: 'user-existing',
        email: 'first-admin@test.local',
        displayName: 'Existing',
        organizationId: null,
      });
      tx.user.update.mockResolvedValue({
        id: 'user-existing',
        email: 'first-admin@test.local',
        displayName: 'Existing',
      });

      await service.createOrganization(platformAdmin, dto);

      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-existing' },
        data: { organizationId: 'org-new' },
      });
    });

    it('throws ConflictException when the designated firstAdmin already belongs to a different organization', async () => {
      tx.organization.create.mockResolvedValue({
        id: 'org-new',
        name: 'Acme Corp',
        dataRegion: null,
        seatCount: 0,
        createdAt: new Date(),
      });
      tx.user.findUnique.mockResolvedValue({
        id: 'user-existing',
        email: 'first-admin@test.local',
        organizationId: 'some-other-org',
      });

      await expect(service.createOrganization(platformAdmin, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('getOrganization', () => {
    it("throws NotFoundException (not 403) for a caller who is neither platform ADMIN nor that org's ENTERPRISE_ADMIN", async () => {
      await expect(service.getOrganization(plainMember, 'org-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getOrganization(outsider, 'org-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(appPrisma.organization.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the org does not exist, even for a platform admin', async () => {
      appPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.getOrganization(platformAdmin, 'org-missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns the org and its members for that org's ENTERPRISE_ADMIN", async () => {
      appPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        dataRegion: null,
        seatCount: 2,
        createdAt: new Date('2026-01-01'),
      });
      appPrisma.organizationMembership.findMany.mockResolvedValue([
        {
          orgRole: 'ENTERPRISE_ADMIN',
          user: { id: 'org-admin-1', email: 'a@test.local', displayName: 'A' },
        },
        { orgRole: 'MEMBER', user: { id: 'member-1', email: 'b@test.local', displayName: 'B' } },
      ]);

      const result = await service.getOrganization(orgAdmin, 'org-1');

      expect(result.id).toBe('org-1');
      expect(result.members).toHaveLength(2);
      expect(result.members[0]).toEqual({
        userId: 'org-admin-1',
        email: 'a@test.local',
        displayName: 'A',
        orgRole: 'ENTERPRISE_ADMIN',
      });
      // An org's own ENTERPRISE_ADMIN reading their own org isn't a
      // cross-tenant read — no audit entry for this case.
      expect(appPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('returns the org for a platform admin regardless of their own organizationId, and writes a cross-tenant-read audit entry (Part 9B)', async () => {
      appPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        dataRegion: null,
        seatCount: 0,
        createdAt: new Date(),
      });
      appPrisma.organizationMembership.findMany.mockResolvedValue([]);

      await expect(service.getOrganization(platformAdmin, 'org-1')).resolves.toEqual(
        expect.objectContaining({ id: 'org-1' }),
      );

      expect(appPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: platformAdmin.userId,
            action: 'organization.cross_tenant_read',
            targetType: 'Organization',
            targetId: 'org-1',
            tenantId: 'org-1',
          }),
        }),
      );
    });
  });

  describe('addMembers', () => {
    const dto: AddOrganizationMembersRequest = {
      members: [
        makeMemberInput({ email: 'm1@test.local' }),
        makeMemberInput({ email: 'm2@test.local' }),
      ],
      orgRole: 'MEMBER',
    };

    it('throws NotFoundException for an unauthorized caller without ever starting a transaction', async () => {
      await expect(service.addMembers(plainMember, 'org-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(servicePrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the org does not exist', async () => {
      tx.organization.findUnique.mockResolvedValue(null);
      await expect(service.addMembers(orgAdmin, 'org-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('adds every member in the batch, atomically, defaulting to the request-level orgRole', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.user.findUnique.mockResolvedValue(null);
      tx.user.create
        .mockResolvedValueOnce({ id: 'u1', email: 'm1@test.local', displayName: 'New Member' })
        .mockResolvedValueOnce({ id: 'u2', email: 'm2@test.local', displayName: 'New Member' });

      const result = await service.addMembers(orgAdmin, 'org-1', dto);

      expect(result.members).toHaveLength(2);
      expect(result.members.every((m) => m.orgRole === 'MEMBER')).toBe(true);
      expect(tx.organizationMembership.create).toHaveBeenCalledTimes(2);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
      expect(events.publish).toHaveBeenCalledWith(
        'identity.organization.membership_changed',
        expect.objectContaining({
          userId: 'u1',
          payload: { organizationId: 'org-1', userId: 'u1', action: 'added' },
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.organization.membership_changed',
        expect.objectContaining({
          userId: 'u2',
          payload: { organizationId: 'org-1', userId: 'u2', action: 'added' },
        }),
      );
    });

    it('does not publish any membership_changed event when the whole batch rolls back', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'u2',
        email: 'm2@test.local',
        organizationId: 'some-other-org',
      });
      tx.user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'm1@test.local',
        displayName: 'New Member',
      });

      await expect(service.addMembers(orgAdmin, 'org-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('rolls back the whole batch when one member already belongs to a different organization (bulk-import atomicity)', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.user.findUnique
        .mockResolvedValueOnce(null) // m1: fine, creates new user
        .mockResolvedValueOnce({
          id: 'u2',
          email: 'm2@test.local',
          organizationId: 'some-other-org',
        }); // m2: conflict
      tx.user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'm1@test.local',
        displayName: 'New Member',
      });

      await expect(service.addMembers(orgAdmin, 'org-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // The transaction callback itself throws — Prisma's real $transaction
      // would roll back on that rejection; this test proves the callback
      // never "swallows" m2's failure and returns partial success.
      expect(tx.organizationMembership.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeMember', () => {
    it('throws NotFoundException for an unauthorized caller', async () => {
      await expect(service.removeMember(plainMember, 'org-1', 'user-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(servicePrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the org does not exist', async () => {
      tx.organization.findUnique.mockResolvedValue(null);
      await expect(service.removeMember(orgAdmin, 'org-1', 'user-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the membership does not exist', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.organizationMembership.findUnique.mockResolvedValue(null);
      await expect(service.removeMember(orgAdmin, 'org-1', 'user-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('happy path: deletes the membership, clears User.organizationId, bumps tokensValidAfter, and writes an audit log entry', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.organizationMembership.findUnique.mockResolvedValue({
        id: 'membership-1',
        userId: 'user-x',
        orgRole: 'MEMBER',
      });

      await service.removeMember(orgAdmin, 'org-1', 'user-x');

      expect(tx.organizationMembership.deleteMany).toHaveBeenCalledWith({
        where: { id: 'membership-1' },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-x' },
        data: { organizationId: null, tokensValidAfter: expect.any(Date) as Date },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'organization.member.removed' }),
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'identity.organization.membership_changed',
        expect.objectContaining({
          userId: 'user-x',
          tenantId: 'org-1',
          payload: { organizationId: 'org-1', userId: 'user-x', action: 'removed' },
        }),
      );
    });

    it("translates the last-ENTERPRISE_ADMIN trigger's raised exception into a 409 ConflictException", async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.organizationMembership.findUnique.mockResolvedValue({
        id: 'membership-1',
        userId: 'user-x',
        orgRole: 'ENTERPRISE_ADMIN',
      });
      tx.organizationMembership.deleteMany.mockRejectedValue(
        new Prisma.PrismaClientUnknownRequestError('...cannot_remove_last_enterprise_admin...', {
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.removeMember(orgAdmin, 'org-1', 'user-x')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows an unrelated PrismaClientUnknownRequestError unchanged', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.organizationMembership.findUnique.mockResolvedValue({
        id: 'membership-1',
        userId: 'user-x',
        orgRole: 'MEMBER',
      });
      const unrelated = new Prisma.PrismaClientUnknownRequestError('some other db error', {
        clientVersion: '6.19.3',
      });
      tx.organizationMembership.deleteMany.mockRejectedValue(unrelated);

      await expect(service.removeMember(orgAdmin, 'org-1', 'user-x')).rejects.toBe(unrelated);
    });

    it('throws NotFoundException (not a Prisma error) when a concurrent request already removed the same membership between the lookup and the delete', async () => {
      tx.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      tx.organizationMembership.findUnique.mockResolvedValue({
        id: 'membership-1',
        userId: 'user-x',
        orgRole: 'MEMBER',
      });
      tx.organizationMembership.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeMember(orgAdmin, 'org-1', 'user-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
