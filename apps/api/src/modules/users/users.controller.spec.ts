import type { Session } from '@linguaai/types/identity';
import type {
  CurrentUserResponse,
  DeletionRequestResponse,
  PublicUser,
} from '@linguaai/validation/identity';

import type { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

describe('UsersController', () => {
  const session: Session = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: 'u-1',
    deviceLabel: 'jest-agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-02T00:00:00.000Z',
    revokedAt: null,
  };

  const req = {
    user: { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null },
  } as unknown as Parameters<UsersController['listSessions']>[0];

  it('getCurrentUser delegates to UsersService scoped to the caller', async () => {
    const response: CurrentUserResponse = {
      id: 'u-1',
      email: 'user@test.local',
      displayName: 'Name',
      avatarUrl: null,
      locale: 'en-US',
      timezone: 'UTC',
      role: 'USER',
      status: 'ACTIVE',
      mfaEnrolled: false,
      organizationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      profile: null,
    };
    const usersService = {
      getCurrentUser: jest.fn().mockResolvedValue(response),
    } as unknown as UsersService;
    const controller = new UsersController(usersService);

    const result = await controller.getCurrentUser(req);

    expect(usersService.getCurrentUser).toHaveBeenCalledWith('u-1');
    expect(result).toBe(response);
  });

  it('updateProfile delegates to UsersService with the caller and the validated body', async () => {
    const response: PublicUser = {
      id: 'u-1',
      email: 'user@test.local',
      displayName: 'New Name',
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
    const usersService = {
      updateProfile: jest.fn().mockResolvedValue(response),
    } as unknown as UsersService;
    const controller = new UsersController(usersService);

    const result = await controller.updateProfile(req, { displayName: 'New Name' });

    expect(usersService.updateProfile).toHaveBeenCalledWith('u-1', { displayName: 'New Name' });
    expect(result).toBe(response);
  });

  it('requestDeletion delegates to UsersService scoped to the caller', async () => {
    const response: DeletionRequestResponse = {
      status: 'ACCEPTED',
      requestedAt: '2026-01-01T00:00:00.000Z',
    };
    const usersService = {
      requestDeletion: jest.fn().mockResolvedValue(response),
    } as unknown as UsersService;
    const controller = new UsersController(usersService);

    const result = await controller.requestDeletion(req);

    expect(usersService.requestDeletion).toHaveBeenCalledWith('u-1');
    expect(result).toBe(response);
  });

  it('listSessions delegates to UsersService scoped to the caller', async () => {
    const usersService = {
      listSessions: jest.fn().mockResolvedValue([session]),
    } as unknown as UsersService;
    const controller = new UsersController(usersService);

    const result = await controller.listSessions(req);

    expect(usersService.listSessions).toHaveBeenCalledWith('u-1');
    expect(result).toEqual([session]);
  });

  it('revokeSession delegates to UsersService with the caller and the path id', async () => {
    const usersService = {
      revokeSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as UsersService;
    const controller = new UsersController(usersService);

    await controller.revokeSession(req, session.id);

    expect(usersService.revokeSession).toHaveBeenCalledWith('u-1', session.id);
  });
});
