import type {
  InitiateRoleChangeRequest,
  RoleChangeRequestResponse,
} from '@linguaai/validation/identity';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { RoleChangeRequestsController } from './role-change-requests.controller.js';
import type { RoleLifecycleService } from './role-lifecycle.service.js';

describe('RoleChangeRequestsController', () => {
  const user: RequestUser = {
    userId: 'admin-1',
    role: 'ADMIN',
    organizationId: null,
    orgRole: null,
  };
  const req = { user } as unknown as Parameters<RoleChangeRequestsController['initiate']>[0];

  it('initiate delegates to RoleLifecycleService.initiateRoleChange with the caller, target id, and toRole', async () => {
    const response: RoleChangeRequestResponse = {
      id: 'rcr-1',
      targetUserId: 'target-1',
      fromRole: 'USER',
      toRole: 'TEACHER',
      requestedBy: user.userId,
      approvedBy: user.userId,
      status: 'APPROVED',
      expiresAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: '2026-01-01T00:00:00.000Z',
    };
    const service = {
      initiateRoleChange: jest.fn().mockResolvedValue(response),
    } as unknown as RoleLifecycleService;
    const controller = new RoleChangeRequestsController(service);
    const dto: InitiateRoleChangeRequest = { toRole: 'TEACHER' };

    const result = await controller.initiate(req, 'target-1', dto);

    expect(service.initiateRoleChange).toHaveBeenCalledWith(user, 'target-1', 'TEACHER');
    expect(result).toBe(response);
  });

  it('approve delegates to RoleLifecycleService.approveRoleChange with the caller, target id, and request id', async () => {
    const response: RoleChangeRequestResponse = {
      id: 'rcr-1',
      targetUserId: 'target-1',
      fromRole: 'USER',
      toRole: 'ADMIN',
      requestedBy: 'someone-else',
      approvedBy: user.userId,
      status: 'APPROVED',
      expiresAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: '2026-01-01T00:00:00.000Z',
    };
    const service = {
      approveRoleChange: jest.fn().mockResolvedValue(response),
    } as unknown as RoleLifecycleService;
    const controller = new RoleChangeRequestsController(service);

    const result = await controller.approve(req, 'target-1', 'rcr-1');

    expect(service.approveRoleChange).toHaveBeenCalledWith(user, 'target-1', 'rcr-1');
    expect(result).toBe(response);
  });
});
