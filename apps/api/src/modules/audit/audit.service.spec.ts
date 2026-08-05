import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type { AuditLogQuery } from '@linguaai/validation/identity';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AuditService } from './audit.service.js';

function makeRow(overrides: Partial<{ id: string; occurredAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'audit-1',
    actorUserId: 'user-1',
    actorType: 'USER',
    action: 'organization.created',
    targetType: 'Organization',
    targetId: 'org-1',
    tenantId: 'org-1',
    correlationId: 'corr-1',
    beforeValue: null,
    afterValue: { name: 'Acme' },
    occurredAt: overrides.occurredAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('AuditService', () => {
  let appPrisma: { auditLog: { findMany: jest.Mock } };
  let service: AuditService;

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

  const defaultQuery: AuditLogQuery = { limit: 20 };

  beforeEach(() => {
    appPrisma = { auditLog: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new AuditService(appPrisma as unknown as PrismaClient);
  });

  describe('listPlatformAuditLog', () => {
    it('queries with no tenantId filter (platform-wide, unscoped)', async () => {
      await service.listPlatformAuditLog(defaultQuery);

      expect(appPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: undefined }) }),
      );
    });

    it('passes through action/actorUserId filters', async () => {
      await service.listPlatformAuditLog({
        limit: 20,
        action: 'organization.created',
        actorUserId: 'user-9',
      });

      expect(appPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'organization.created', actorUserId: 'user-9' }),
        }),
      );
    });

    it('maps rows to the response DTO shape (ISO timestamps, no Date objects)', async () => {
      appPrisma.auditLog.findMany.mockResolvedValue([makeRow()]);

      const result = await service.listPlatformAuditLog(defaultQuery);

      expect(result.data).toEqual([
        expect.objectContaining({ id: 'audit-1', occurredAt: '2026-01-01T00:00:00.000Z' }),
      ]);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra row when more results exist than the page limit', async () => {
      appPrisma.auditLog.findMany.mockResolvedValue([
        makeRow({ id: 'a' }),
        makeRow({ id: 'b' }),
        makeRow({ id: 'c' }),
      ]);

      const result = await service.listPlatformAuditLog({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((r) => r.id)).toEqual(['a', 'b']);
      expect(result.meta.nextCursor).toBe('b');
      expect(appPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });

    it('passes the cursor through as { cursor: { id }, skip: 1 } when provided', async () => {
      await service.listPlatformAuditLog({ limit: 20, cursor: 'last-seen-id' });

      expect(appPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'last-seen-id' }, skip: 1 }),
      );
    });

    it('orders by occurredAt desc with id as a stable tiebreaker (id is a random UUID, not chronological)', async () => {
      await service.listPlatformAuditLog(defaultQuery);

      expect(appPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] }),
      );
    });
  });

  describe('listOrganizationAuditLog', () => {
    it("throws NotFoundException for a caller who is neither platform ADMIN nor that org's ENTERPRISE_ADMIN", async () => {
      await expect(
        service.listOrganizationAuditLog(plainMember, 'org-1', defaultQuery),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(appPrisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it("scopes the query to the given org's tenantId for that org's ENTERPRISE_ADMIN", async () => {
      await service.listOrganizationAuditLog(orgAdmin, 'org-1', defaultQuery);

      expect(appPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'org-1' }) }),
      );
    });

    it("allows a platform admin to read any organization's audit log", async () => {
      await expect(
        service.listOrganizationAuditLog(platformAdmin, 'org-999', defaultQuery),
      ).resolves.toEqual({ data: [], meta: { nextCursor: null } });
    });
  });
});
