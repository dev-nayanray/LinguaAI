import { UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import type { OAuthEnv } from '@linguaai/config';
import type { Request } from 'express';

import type { OAuthOutcome, OAuthService, RequestWithOAuthLinking } from '../oauth.service.js';
import { AppleStrategy } from './apple.strategy.js';

describe('AppleStrategy', () => {
  const fakeOAuthConfig: OAuthEnv = {
    API_URL: 'http://localhost:4000',
    GOOGLE_CLIENT_ID: 'unused',
    GOOGLE_CLIENT_SECRET: 'unused',
    APPLE_CLIENT_ID: 'com.linguaai.test',
    APPLE_TEAM_ID: 'TESTTEAM',
    APPLE_KEY_ID: 'TESTKEY',
    APPLE_PRIVATE_KEY: 'test-key-content',
  };

  // Apple's id_token is an ordinary signed JWT (Part 8) — validate() only
  // decodes it (matching passport-apple's own documented pattern, see
  // apple.strategy.ts's doc comment), so a token signed with any secret
  // (not Apple's real key) is fine for exercising the decode+claims path.
  function makeIdToken(claims: Record<string, unknown>): string {
    return sign(claims, 'test-signing-secret');
  }

  it('decodes the id_token and delegates to OAuthService.handleResolvedProfile with no linkingUserId for an ordinary login', async () => {
    const outcome: OAuthOutcome = {
      kind: 'authenticated',
      accessToken: 'jwt',
      refreshToken: 'raw-rt',
      user: {} as never,
    };
    const oauthService = {
      handleResolvedProfile: jest.fn().mockResolvedValue(outcome),
    } as unknown as OAuthService;
    const strategy = new AppleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: { 'user-agent': 'jest-agent' }, ip: '1.2.3.4' } as unknown as Request &
      RequestWithOAuthLinking;
    const idToken = makeIdToken({ sub: 'apple-sub-123', email: 'user@privaterelay.appleid.com' });

    const result = await strategy.validate(req, 'access-token', 'refresh-token', idToken);

    expect(oauthService.handleResolvedProfile).toHaveBeenCalledWith(
      {
        provider: 'APPLE',
        providerAccountId: 'apple-sub-123',
        email: 'user@privaterelay.appleid.com',
        displayName: 'user@privaterelay.appleid.com',
      },
      null,
      'jest-agent',
      '1.2.3.4',
    );
    expect(result).toBe(outcome);
  });

  it('passes through req.oauthLinkingUserId when the callback guard tagged the request as a linking flow (E2-T12)', async () => {
    const outcome: OAuthOutcome = {
      kind: 'linked',
      provider: 'APPLE',
      providerAccountId: 'apple-sub-123',
      linkedAt: '2026-01-01T00:00:00.000Z',
    };
    const oauthService = {
      handleResolvedProfile: jest.fn().mockResolvedValue(outcome),
    } as unknown as OAuthService;
    const strategy = new AppleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {}, oauthLinkingUserId: 'u-1' } as unknown as Request &
      RequestWithOAuthLinking;
    const idToken = makeIdToken({ sub: 'apple-sub-123', email: 'user@privaterelay.appleid.com' });

    const result = await strategy.validate(req, 'access-token', 'refresh-token', idToken);

    expect(oauthService.handleResolvedProfile).toHaveBeenCalledWith(
      expect.anything(),
      'u-1',
      null,
      null,
    );
    expect(result).toBe(outcome);
  });

  it('throws UnauthorizedException when the id_token has no sub claim', async () => {
    const oauthService = { handleResolvedProfile: jest.fn() } as unknown as OAuthService;
    const strategy = new AppleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {} } as unknown as Request & RequestWithOAuthLinking;
    const idToken = makeIdToken({ email: 'user@test.local' });

    await expect(
      strategy.validate(req, 'access-token', 'refresh-token', idToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(oauthService.handleResolvedProfile).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the id_token has no email claim', async () => {
    const oauthService = { handleResolvedProfile: jest.fn() } as unknown as OAuthService;
    const strategy = new AppleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {} } as unknown as Request & RequestWithOAuthLinking;
    const idToken = makeIdToken({ sub: 'apple-sub-123' });

    await expect(
      strategy.validate(req, 'access-token', 'refresh-token', idToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException for an unparseable id_token', async () => {
    const oauthService = { handleResolvedProfile: jest.fn() } as unknown as OAuthService;
    const strategy = new AppleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {} } as unknown as Request & RequestWithOAuthLinking;

    await expect(
      strategy.validate(req, 'access-token', 'refresh-token', 'not-a-jwt'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
