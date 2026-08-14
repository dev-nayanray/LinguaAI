import { UnprocessableEntityException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import type { DomainEventPublisher } from '../../events/index.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';

describe('NotificationPreferencesService', () => {
  const findMany = jest.fn();
  const upsert = jest.fn();
  const appPrisma = { notificationPreference: { findMany, upsert } };
  const publish = jest.fn();
  const events = { publish };

  function makeService(): NotificationPreferencesService {
    return new NotificationPreferencesService(
      appPrisma as unknown as PrismaClient,
      events as unknown as DomainEventPublisher,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    publish.mockResolvedValue(undefined);
  });

  describe('getPreferences', () => {
    it('synthesizes the full default-opted-in set (2 channels x 6 types = 12 rows) when no real rows exist', async () => {
      findMany.mockResolvedValue([]);
      const service = makeService();

      const result = await service.getPreferences('99999999-9999-4999-8999-999999999999');

      expect(result).toHaveLength(12);
      expect(result.every((row) => row.optedIn === true)).toBe(true);
      expect(findMany).toHaveBeenCalledWith({
        where: { userId: '99999999-9999-4999-8999-999999999999' },
      });
    });

    it('overrides the default with a real row where one exists — a real opt-out is honored', async () => {
      findMany.mockResolvedValue([{ channel: 'EMAIL', type: 'MARKETING', optedIn: false }]);
      const service = makeService();

      const result = await service.getPreferences('99999999-9999-4999-8999-999999999999');

      const marketing = result.find((row) => row.channel === 'EMAIL' && row.type === 'MARKETING');
      expect(marketing?.optedIn).toBe(false);
      const other = result.find((row) => row.channel === 'EMAIL' && row.type === 'SYSTEM');
      expect(other?.optedIn).toBe(true);
    });
  });

  describe('updatePreference', () => {
    it('rejects a SECURITY_ALERT opt-out attempt with 422 — never silently stored as a meaningless row', async () => {
      const service = makeService();

      await expect(
        service.updatePreference('99999999-9999-4999-8999-999999999999', {
          channel: 'EMAIL',
          type: 'SECURITY_ALERT',
          optedIn: false,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(upsert).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });

    it('upserts the real row and publishes notification.preference.changed', async () => {
      upsert.mockResolvedValue({ channel: 'EMAIL', type: 'MARKETING', optedIn: false });
      const service = makeService();

      const result = await service.updatePreference('99999999-9999-4999-8999-999999999999', {
        channel: 'EMAIL',
        type: 'MARKETING',
        optedIn: false,
      });

      expect(upsert).toHaveBeenCalledWith({
        where: {
          userId_channel_type: {
            userId: '99999999-9999-4999-8999-999999999999',
            channel: 'EMAIL',
            type: 'MARKETING',
          },
        },
        create: {
          userId: '99999999-9999-4999-8999-999999999999',
          channel: 'EMAIL',
          type: 'MARKETING',
          optedIn: false,
        },
        update: { optedIn: false },
      });
      expect(publish).toHaveBeenCalledWith('notification.preference.changed', {
        userId: '99999999-9999-4999-8999-999999999999',
        payload: {
          userId: '99999999-9999-4999-8999-999999999999',
          channel: 'EMAIL',
          type: 'MARKETING',
          enabled: false,
        },
      });
      expect(result).toEqual({ channel: 'EMAIL', type: 'MARKETING', optedIn: false });
    });
  });
});
