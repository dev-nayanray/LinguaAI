import type { DeviceToken } from '@linguaai/database';

import { DeviceTokensController } from './device-tokens.controller.js';
import type { DeviceTokensService } from './device-tokens.service.js';

function buildReq() {
  return {
    user: { userId: 'user-1', role: 'LEARNER', organizationId: null, orgRole: null },
  };
}

describe('DeviceTokensController', () => {
  it("register delegates to DeviceTokensService with the caller's own userId and the request body", async () => {
    const response: DeviceToken = {
      id: 'dt-1',
      userId: 'user-1',
      platform: 'ANDROID',
      token: 'fcm-token-1',
      active: true,
    };
    const service = { register: jest.fn().mockResolvedValue(response) };
    const controller = new DeviceTokensController(service as unknown as DeviceTokensService);
    const dto = { platform: 'ANDROID' as const, token: 'fcm-token-1' };

    const result = await controller.register(
      buildReq() as unknown as Parameters<typeof controller.register>[0],
      dto,
    );

    expect(service.register).toHaveBeenCalledWith('user-1', dto);
    expect(result).toBe(response);
  });

  it("remove delegates to DeviceTokensService with the caller's own userId and the path token", async () => {
    const service = { remove: jest.fn().mockResolvedValue(undefined) };
    const controller = new DeviceTokensController(service as unknown as DeviceTokensService);

    await controller.remove(
      buildReq() as unknown as Parameters<typeof controller.remove>[0],
      'fcm-token-1',
    );

    expect(service.remove).toHaveBeenCalledWith('user-1', 'fcm-token-1');
  });
});
