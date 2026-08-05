import type {
  AddOrganizationMembersRequest,
  ChangeOrgMemberRoleRequest,
  CreateOrganizationRequest,
  OrganizationDetailResponse,
} from '@linguaai/validation/identity';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import type { RoleLifecycleService } from '../users/index.js';
import { OrganizationsController } from './organizations.controller.js';
import type { OrganizationsService } from './organizations.service.js';

describe('OrganizationsController', () => {
  const user: RequestUser = { userId: 'u-1', role: 'ADMIN', organizationId: null, orgRole: null };
  const req = { user } as unknown as Parameters<OrganizationsController['create']>[0];
  const noopRoleLifecycleService = {} as RoleLifecycleService;

  it('create delegates to OrganizationsService.createOrganization with the caller and dto', async () => {
    const response: OrganizationDetailResponse = {
      id: 'org-1',
      name: 'Acme',
      dataRegion: null,
      seatCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      members: [],
    };
    const service = {
      createOrganization: jest.fn().mockResolvedValue(response),
    } as unknown as OrganizationsService;
    const controller = new OrganizationsController(service, noopRoleLifecycleService);
    const dto: CreateOrganizationRequest = {
      name: 'Acme',
      firstAdmin: { email: 'a@test.local', displayName: 'A', locale: 'en-US', timezone: 'UTC' },
    };

    const result = await controller.create(req, dto);

    expect(service.createOrganization).toHaveBeenCalledWith(user, dto);
    expect(result).toBe(response);
  });

  it('get delegates to OrganizationsService.getOrganization with the caller and org id', async () => {
    const response: OrganizationDetailResponse = {
      id: 'org-1',
      name: 'Acme',
      dataRegion: null,
      seatCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      members: [],
    };
    const service = {
      getOrganization: jest.fn().mockResolvedValue(response),
    } as unknown as OrganizationsService;
    const controller = new OrganizationsController(service, noopRoleLifecycleService);

    const result = await controller.get(req, 'org-1');

    expect(service.getOrganization).toHaveBeenCalledWith(user, 'org-1');
    expect(result).toBe(response);
  });

  it('addMembers delegates to OrganizationsService.addMembers with the caller, org id, and dto', async () => {
    const response = { members: [] };
    const service = {
      addMembers: jest.fn().mockResolvedValue(response),
    } as unknown as OrganizationsService;
    const controller = new OrganizationsController(service, noopRoleLifecycleService);
    const dto: AddOrganizationMembersRequest = {
      members: [{ email: 'a@test.local', displayName: 'A', locale: 'en-US', timezone: 'UTC' }],
      orgRole: 'MEMBER',
    };

    const result = await controller.addMembers(req, 'org-1', dto);

    expect(service.addMembers).toHaveBeenCalledWith(user, 'org-1', dto);
    expect(result).toBe(response);
  });

  it('removeMember delegates to OrganizationsService.removeMember with the caller, org id, and target user id', async () => {
    const service = {
      removeMember: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationsService;
    const controller = new OrganizationsController(service, noopRoleLifecycleService);

    await controller.removeMember(req, 'org-1', 'user-2');

    expect(service.removeMember).toHaveBeenCalledWith(user, 'org-1', 'user-2');
  });

  it('changeMemberRole delegates to RoleLifecycleService.changeOrgMemberRole with the caller, org id, target user id, and orgRole', async () => {
    const service = {} as OrganizationsService;
    const roleLifecycleService = {
      changeOrgMemberRole: jest.fn().mockResolvedValue(undefined),
    } as unknown as RoleLifecycleService;
    const controller = new OrganizationsController(service, roleLifecycleService);
    const dto: ChangeOrgMemberRoleRequest = { orgRole: 'ENTERPRISE_ADMIN' };

    await controller.changeMemberRole(req, 'org-1', 'user-2', dto);

    expect(roleLifecycleService.changeOrgMemberRole).toHaveBeenCalledWith(
      user,
      'org-1',
      'user-2',
      'ENTERPRISE_ADMIN',
    );
  });
});
