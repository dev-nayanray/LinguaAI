import { UnauthorizedException } from '@nestjs/common';
import type { AuthEnv } from '@linguaai/config';

import type { AuthService } from '../auth.service.js';
import type { JtiDenylistService } from '../jti-denylist.service.js';
import { JwtStrategy, type AccessTokenPayload } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  const fakeAuthConfig: AuthEnv = {
    JWT_ACCESS_SECRET: 'test-secret',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
  };

  const payload: AccessTokenPayload = {
    sub: 'u-1',
    role: 'USER',
    organizationId: null,
    orgRole: null,
    jti: 'jti-1',
    iat: 1_000,
    exp: 2_000,
  };

  function makeJtiDenylist(denylisted = false): JtiDenylistService {
    return {
      isDenylisted: jest.fn().mockResolvedValue(denylisted),
    } as unknown as JtiDenylistService;
  }

  it('returns the narrowed RequestUser shape when the token is not stale and not denylisted', async () => {
    const authService = {
      isTokenStale: jest.fn().mockResolvedValue(false),
    } as unknown as AuthService;
    const jtiDenylist = makeJtiDenylist(false);
    const strategy = new JwtStrategy(authService, jtiDenylist, fakeAuthConfig);

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 'u-1',
      role: 'USER',
      organizationId: null,
      orgRole: null,
    });
    expect(authService.isTokenStale).toHaveBeenCalledWith('u-1', 1_000);
    expect(jtiDenylist.isDenylisted).toHaveBeenCalledWith('jti-1');
  });

  it('throws UnauthorizedException when the token was issued before tokensValidAfter', async () => {
    const authService = {
      isTokenStale: jest.fn().mockResolvedValue(true),
    } as unknown as AuthService;
    const strategy = new JwtStrategy(authService, makeJtiDenylist(), fakeAuthConfig);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException when the jti is denylisted (E2-T28 — immediate single-session revocation), even though the token is not stale', async () => {
    const authService = {
      isTokenStale: jest.fn().mockResolvedValue(false),
    } as unknown as AuthService;
    const strategy = new JwtStrategy(authService, makeJtiDenylist(true), fakeAuthConfig);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
