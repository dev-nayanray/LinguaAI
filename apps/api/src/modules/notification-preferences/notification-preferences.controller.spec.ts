import type { NotificationPreference } from '@linguaai/validation/notification';

import { NotificationPreferencesController } from './notification-preferences.controller.js';
import type { NotificationPreferencesService } from './notification-preferences.service.js';

function buildReq() {
  return {
    user: { userId: 'user-1', role: 'LEARNER', organizationId: null, orgRole: null },
  };
}

describe('NotificationPreferencesController', () => {
  it("getPreferences delegates to NotificationPreferencesService with the caller's own userId", async () => {
    const response: NotificationPreference[] = [
      { channel: 'EMAIL', type: 'SYSTEM', optedIn: true },
    ];
    const service = { getPreferences: jest.fn().mockResolvedValue(response) };
    const controller = new NotificationPreferencesController(
      service as unknown as NotificationPreferencesService,
    );

    const result = await controller.getPreferences(
      buildReq() as unknown as Parameters<typeof controller.getPreferences>[0],
    );

    expect(service.getPreferences).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });

  it("updatePreference delegates to NotificationPreferencesService with the caller's own userId and the request body", async () => {
    const response: NotificationPreference = {
      channel: 'EMAIL',
      type: 'MARKETING',
      optedIn: false,
    };
    const service = { updatePreference: jest.fn().mockResolvedValue(response) };
    const controller = new NotificationPreferencesController(
      service as unknown as NotificationPreferencesService,
    );
    const dto = { channel: 'EMAIL' as const, type: 'MARKETING' as const, optedIn: false };

    const result = await controller.updatePreference(
      buildReq() as unknown as Parameters<typeof controller.updatePreference>[0],
      dto,
    );

    expect(service.updatePreference).toHaveBeenCalledWith('user-1', dto);
    expect(result).toBe(response);
  });
});
