import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthEnv } from '@linguaai/config';

import { AUTH_CONFIG } from '../auth.config.js';
import { AuthService } from '../auth.service.js';
import { JtiDenylistService } from '../jti-denylist.service.js';

/** The decoded, verified access-token payload (Part 8's claim shape) — signature/expiry are already checked by passport-jwt itself before `validate()` runs. */
export interface AccessTokenPayload {
  sub: string;
  role: string;
  organizationId: string | null;
  orgRole: string | null;
  jti: string;
  iat: number;
  exp: number;
}

/** What every JWT-guarded route sees as `req.user` — deliberately narrower than the full payload (no `jti`/`exp` noise route handlers don't need). */
export interface RequestUser {
  userId: string;
  role: string;
  organizationId: string | null;
  orgRole: string | null;
}

/**
 * Validates the `Authorization: Bearer` access token on protected routes
 * (Part 7's component design). No route in this Epic uses it yet — E2-T14
 * (`RolesGuard`/`tenant.middleware.ts`) and E2-T10 (logout) are its first
 * real consumers via `@UseGuards(AuthGuard('jwt'))`, the same
 * inline-guard pattern `AuthController.login` already uses for
 * `AuthGuard('local')` (E2-T8) rather than a dedicated guard class.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly jtiDenylist: JtiDenylistService,
    @Inject(AUTH_CONFIG) authConfig: AuthEnv,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: authConfig.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    const stale = await this.authService.isTokenStale(payload.sub, payload.iat);
    if (stale) {
      throw new UnauthorizedException(
        'Token is no longer valid — role or organization membership has changed',
      );
    }

    // E2-T28 remediation: closes the gap where a single-device logout
    // (`revokeSession`) or explicit session revocation
    // (`DELETE /v1/users/me/sessions/:id`) left the already-issued access
    // token valid until its own natural expiry — see `JtiDenylistService`'s
    // own doc comment for the full rationale, including why this check
    // fails open (not closed) on a Redis error.
    const denylisted = await this.jtiDenylist.isDenylisted(payload.jti);
    if (denylisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      userId: payload.sub,
      role: payload.role,
      organizationId: payload.organizationId,
      orgRole: payload.orgRole,
    };
  }
}
