import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { DeviceTokensService } from './device-tokens.service.js';

describe('DeviceTokensService', () => {
  const upsert = jest.fn();
  const findUnique = jest.fn();
  const deleteFn = jest.fn();
  const appPrisma = { deviceToken: { upsert, findUnique, delete: deleteFn } };

  function makeService(): DeviceTokensService {
    return new DeviceTokensService(appPrisma as unknown as PrismaClient);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('upserts on token, creating a real row for a genuinely new token', async () => {
      const row = {
        id: 'dt-1',
        userId: 'user-1',
        platform: 'ANDROID',
        token: 'tok-1',
        active: true,
      };
      upsert.mockResolvedValue(row);
      const service = makeService();

      const result = await service.register('user-1', { platform: 'ANDROID', token: 'tok-1' });

      expect(upsert).toHaveBeenCalledWith({
        where: { token: 'tok-1' },
        create: { userId: 'user-1', platform: 'ANDROID', token: 'tok-1', active: true },
        update: { userId: 'user-1', platform: 'ANDROID', active: true },
      });
      expect(result).toBe(row);
    });

    it('reassigns an already-known token to the new caller on re-registration (shared device / account switch)', async () => {
      const row = { id: 'dt-1', userId: 'user-2', platform: 'IOS', token: 'tok-1', active: true };
      upsert.mockResolvedValue(row);
      const service = makeService();

      await service.register('user-2', { platform: 'IOS', token: 'tok-1' });

      const call = upsert.mock.calls[0]![0];
      expect(call.update).toEqual({ userId: 'user-2', platform: 'IOS', active: true });
    });
  });

  describe('remove', () => {
    it('deletes the token when it exists and belongs to the caller', async () => {
      findUnique.mockResolvedValue({
        id: 'dt-1',
        userId: 'user-1',
        platform: 'ANDROID',
        token: 'tok-1',
        active: true,
      });
      deleteFn.mockResolvedValue(undefined);
      const service = makeService();

      await service.remove('user-1', 'tok-1');

      expect(deleteFn).toHaveBeenCalledWith({ where: { token: 'tok-1' } });
    });

    it('throws a real 404 (not 403) for an unknown token, without calling delete', async () => {
      findUnique.mockResolvedValue(null);
      const service = makeService();

      await expect(service.remove('user-1', 'unknown-tok')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it('throws a real 404 (not 403) when the token exists but belongs to someone else — enumeration-resistant', async () => {
      findUnique.mockResolvedValue({
        id: 'dt-1',
        userId: 'someone-else',
        platform: 'ANDROID',
        token: 'tok-1',
        active: true,
      });
      const service = makeService();

      await expect(service.remove('user-1', 'tok-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(deleteFn).not.toHaveBeenCalled();
    });
  });
});
