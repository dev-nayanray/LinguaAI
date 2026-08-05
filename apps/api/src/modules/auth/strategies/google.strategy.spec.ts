import { UnauthorizedException } from '@nestjs/common';
import type { OAuthEnv } from '@linguaai/config';
import type { Profile } from 'passport-google-oauth20';
import type { Request } from 'express';

import type { OAuthOutcome, OAuthService, RequestWithOAuthLinking } from '../oauth.service.js';
import { GoogleStrategy } from './google.strategy.js';

describe('GoogleStrategy', () => {
  const fakeOAuthConfig: OAuthEnv = {
    API_URL: 'http://localhost:4000',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    APPLE_CLIENT_ID: 'unused',
    APPLE_TEAM_ID: 'unused',
    APPLE_KEY_ID: 'unused',
    APPLE_PRIVATE_KEY: 'unused',
  };

  function makeProfile(overrides: Partial<Profile> = {}): Profile {
    return {
      id: 'google-sub-123',
      displayName: 'Test User',
      emails: [{ value: 'user@test.local', verified: true }],
      provider: 'google',
      profileUrl: '',
      _raw: '',
      _json: {} as Profile['_json'],
      ...overrides,
    } as Profile;
  }

  it('resolves the profile into OAuthProfile and delegates to OAuthService.handleResolvedProfile with no linkingUserId for an ordinary login', async () => {
    const outcome: OAuthOutcome = {
      kind: 'authenticated',
      accessToken: 'jwt',
      refreshToken: 'raw-rt',
      user: {} as never,
    };
    const oauthService = {
      handleResolvedProfile: jest.fn().mockResolvedValue(outcome),
    } as unknown as OAuthService;
    const strategy = new GoogleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: { 'user-agent': 'jest-agent' }, ip: '1.2.3.4' } as unknown as Request &
      RequestWithOAuthLinking;

    const result = await strategy.validate(req, 'access-token', 'refresh-token', makeProfile());

    expect(oauthService.handleResolvedProfile).toHaveBeenCalledWith(
      {
        provider: 'GOOGLE',
        providerAccountId: 'google-sub-123',
        email: 'user@test.local',
        displayName: 'Test User',
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
      provider: 'GOOGLE',
      providerAccountId: 'google-sub-123',
      linkedAt: '2026-01-01T00:00:00.000Z',
    };
    const oauthService = {
      handleResolvedProfile: jest.fn().mockResolvedValue(outcome),
    } as unknown as OAuthService;
    const strategy = new GoogleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {}, oauthLinkingUserId: 'u-1' } as unknown as Request &
      RequestWithOAuthLinking;

    const result = await strategy.validate(req, 'access-token', 'refresh-token', makeProfile());

    expect(oauthService.handleResolvedProfile).toHaveBeenCalledWith(
      expect.anything(),
      'u-1',
      null,
      null,
    );
    expect(result).toBe(outcome);
  });

  it('throws UnauthorizedException when Google returns no email', async () => {
    const oauthService = { handleResolvedProfile: jest.fn() } as unknown as OAuthService;
    const strategy = new GoogleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {} } as unknown as Request & RequestWithOAuthLinking;

    await expect(
      strategy.validate(req, 'access-token', 'refresh-token', makeProfile({ emails: [] })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(oauthService.handleResolvedProfile).not.toHaveBeenCalled();
  });

  it('falls back to the email as displayName when Google returns no displayName', async () => {
    const outcome: OAuthOutcome = {
      kind: 'authenticated',
      accessToken: 'jwt',
      refreshToken: 'raw-rt',
      user: {} as never,
    };
    const oauthService = {
      handleResolvedProfile: jest.fn().mockResolvedValue(outcome),
    } as unknown as OAuthService;
    const strategy = new GoogleStrategy(oauthService, fakeOAuthConfig);
    const req = { headers: {} } as unknown as Request & RequestWithOAuthLinking;

    await strategy.validate(req, 'access-token', 'refresh-token', makeProfile({ displayName: '' }));

    expect(oauthService.handleResolvedProfile).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'user@test.local' }),
      null,
      null,
      null,
    );
  });
});
