import type Redis from 'ioredis';

import { JtiDenylistService } from './jti-denylist.service.js';

describe('JtiDenylistService', () => {
  let redis: { set: jest.Mock; get: jest.Mock };
  let service: JtiDenylistService;

  beforeEach(() => {
    redis = { set: jest.fn(), get: jest.fn() };
    service = new JtiDenylistService(redis as unknown as Redis);
  });

  describe('add', () => {
    it('sets the denylist key with a 15-minute TTL', async () => {
      redis.set.mockResolvedValue('OK');

      await service.add('jti-1');

      expect(redis.set).toHaveBeenCalledWith('jti-denylist:jti-1', '1', 'EX', 15 * 60);
    });

    it('swallows a Redis error rather than throwing — best-effort, see class doc comment', async () => {
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.add('jti-1')).resolves.toBeUndefined();
    });
  });

  describe('isDenylisted', () => {
    it('returns true when the key is present', async () => {
      redis.get.mockResolvedValue('1');
      await expect(service.isDenylisted('jti-1')).resolves.toBe(true);
      expect(redis.get).toHaveBeenCalledWith('jti-denylist:jti-1');
    });

    it('returns false when the key is absent', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.isDenylisted('jti-1')).resolves.toBe(false);
    });

    it("fails open (returns false, never throws) on a Redis error — deliberately the opposite of RateLimitGuard's fail-closed default, see class doc comment", async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.isDenylisted('jti-1')).resolves.toBe(false);
    });
  });
});
