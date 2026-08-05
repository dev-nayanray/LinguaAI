import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { decode as decodeJwt } from 'jsonwebtoken';
import Strategy from 'passport-apple';
import type { OAuthEnv } from '@linguaai/config';
import type { Request } from 'express';

import { OAUTH_CONFIG } from '../auth.config.js';
import type { OAuthOutcome, RequestWithOAuthLinking } from '../oauth.service.js';
import { OAuthService } from '../oauth.service.js';

/** The claims this Epic actually needs out of Apple's `id_token` (RFC 7519 JWT) — decoded, not verified: it arrived over TLS directly from Apple's own token endpoint, the same trust boundary the access/refresh token exchange itself relies on. */
interface AppleIdTokenClaims {
  sub: string;
  email?: string;
}

/**
 * `GET /v1/auth/oauth/apple/callback` (Part 7's component design names
 * this file explicitly). Apple's own strategy package doesn't populate a
 * conventional `profile` object — its own docs direct callers to decode
 * `idToken` (the JWT Apple's token endpoint returns) for `sub`/`email`
 * instead, which is what `validate()` does here.
 */
@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(
    private readonly oauthService: OAuthService,
    @Inject(OAUTH_CONFIG) oauthConfig: OAuthEnv,
  ) {
    super({
      clientID: oauthConfig.APPLE_CLIENT_ID,
      teamID: oauthConfig.APPLE_TEAM_ID,
      keyID: oauthConfig.APPLE_KEY_ID,
      privateKeyString: oauthConfig.APPLE_PRIVATE_KEY,
      callbackURL: new URL('/v1/auth/oauth/apple/callback', oauthConfig.API_URL).toString(),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request & RequestWithOAuthLinking,
    _accessToken: string,
    _refreshToken: string,
    idToken: string,
  ): Promise<OAuthOutcome> {
    const claims = decodeJwt(idToken) as AppleIdTokenClaims | null;
    if (!claims?.sub) {
      throw new UnauthorizedException('Apple did not return a usable identity token');
    }
    // Apple only ever includes the user's email on the FIRST authorization
    // for a given app — a later sign-in's id_token still carries the
    // private relay/real email Apple already associated with `sub` on
    // Apple's own side, so `claims.email` remains reliable across
    // sign-ins even though the *first-authorization-only* full profile
    // object isn't.
    if (!claims.email) {
      throw new UnauthorizedException('Apple did not return an email address for this account');
    }
    const deviceLabel = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.oauthService.handleResolvedProfile(
      {
        provider: 'APPLE',
        providerAccountId: claims.sub,
        email: claims.email,
        displayName: claims.email,
      },
      req.oauthLinkingUserId ?? null,
      deviceLabel,
      req.ip ?? null,
    );
  }
}
