import type { AuditLogListResponse, AuditLogQuery } from '@linguaai/validation/identity';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AuditController } from './audit.controller.js';
import type { AuditService } from './audit.service.js';

describe('AuditController', () => {
  const user: RequestUser = {
    userId: 'admin-1',
    role: 'ADMIN',
    organizationId: null,
    orgRole: null,
  };
  const response: AuditLogListResponse = { data: [], meta: { nextCursor: null } };

  it('listPlatform delegates to AuditService.listPlatformAuditLog with the query', async () => {
    const service = {
      listPlatformAuditLog: jest.fn().mockResolvedValue(response),
    } as unknown as AuditService;
    const controller = new AuditController(service);
    const query: AuditLogQuery = { limit: 20 };

    const result = await controller.listPlatform(query);

    expect(service.listPlatformAuditLog).toHaveBeenCalledWith(query);
    expect(result).toBe(response);
  });

  it('listForOrganization delegates to AuditService.listOrganizationAuditLog with the caller, org id, and query', async () => {
    const service = {
      listOrganizationAuditLog: jest.fn().mockResolvedValue(response),
    } as unknown as AuditService;
    const controller = new AuditController(service);
    const req = { user } as unknown as Parameters<AuditController['listForOrganization']>[0];
    const query: AuditLogQuery = { limit: 20 };

    const result = await controller.listForOrganization(req, 'org-1', query);

    expect(service.listOrganizationAuditLog).toHaveBeenCalledWith(user, 'org-1', query);
    expect(result).toBe(response);
  });
});
