import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import type { OAuthEnv } from '@linguaai/config';
import type { Request } from 'express';

import { OAUTH_CONFIG } from '../auth.config.js';
import type { OAuthOutcome, RequestWithOAuthLinking } from '../oauth.service.js';
import { OAuthService } from '../oauth.service.js';

/**
 * `GET /v1/auth/oauth/google/callback` (Part 7's component design names
 * this file explicitly). A thin adapter: resolves `passport-google-oauth20`'s
 * own profile shape into the provider-agnostic `OAuthProfile` and hands off
 * to `OAuthService.handleResolvedProfile` — the account-matching/no-auto-link/
 * linking decision logic lives there exactly once, not duplicated per
 * provider. `passReqToCallback: true` for two reasons: reading `User-Agent`
 * for `Session.deviceLabel` (matching login/register, Part 8), and reading
 * `oauthLinkingUserId` (E2-T12), which `oauth.guards.ts`'s callback guard
 * attaches to the request before this `validate()` runs.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly oauthService: OAuthService,
    @Inject(OAUTH_CONFIG) oauthConfig: OAuthEnv,
  ) {
    super({
      clientID: oauthConfig.GOOGLE_CLIENT_ID,
      clientSecret: oauthConfig.GOOGLE_CLIENT_SECRET,
      callbackURL: new URL('/v1/auth/oauth/google/callback', oauthConfig.API_URL).toString(),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request & RequestWithOAuthLinking,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<OAuthOutcome> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException('Google did not return an email address for this account');
    }
    const deviceLabel = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.oauthService.handleResolvedProfile(
      {
        provider: 'GOOGLE',
        providerAccountId: profile.id,
        email,
        displayName: profile.displayName || email,
      },
      req.oauthLinkingUserId ?? null,
      deviceLabel,
      req.ip ?? null,
    );
  }
}
