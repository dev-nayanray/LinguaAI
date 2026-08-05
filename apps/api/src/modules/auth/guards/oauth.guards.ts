import { Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import type { RequestWithOAuthLinking } from '../oauth.service.js';
import { OAuthService } from '../oauth.service.js';
import type { RequestUser } from '../strategies/jwt.strategy.js';

/**
 * Part 6's `GET /v1/auth/oauth/:provider` is one concrete route per
 * provider here (`/oauth/google`, `/oauth/apple`) — `@nestjs/passport`'s
 * `AuthGuard(strategyName)` needs a static strategy name at class-extension
 * time, so a single dynamically-dispatching `:provider` route can't select
 * between Passport strategies the way it can select a plain Prisma query.
 * This is the standard, idiomatic NestJS+Passport OAuth shape — not a
 * deviation from Part 6's intent, just how a templated path notation
 * necessarily becomes concrete routes under this framework's guard model.
 *
 * `getAuthenticateOptions` generates and persists the CSRF `state` value
 * (Part 8) and hands it to Passport, which embeds it in the redirect to
 * the provider's consent screen — `@nestjs/passport` awaits this method,
 * so the async `OAuthService.createState` call is safe here.
 */
@Injectable()
export class GoogleStartGuard extends AuthGuard('google') {
  constructor(private readonly oauthService: OAuthService) {
    super();
  }

  async getAuthenticateOptions(): Promise<{ state: string }> {
    return { state: await this.oauthService.createState('GOOGLE') };
  }
}

@Injectable()
export class AppleStartGuard extends AuthGuard('apple') {
  constructor(private readonly oauthService: OAuthService) {
    super();
  }

  async getAuthenticateOptions(): Promise<{ state: string }> {
    return { state: await this.oauthService.createState('APPLE') };
  }
}

/**
 * `GET /v1/users/me/oauth-accounts/link/:provider` (E2-T12's concrete
 * translation of Part 6's `POST /v1/users/me/oauth-accounts` — same
 * templated-path-to-concrete-route translation `GoogleStartGuard` above
 * already does, extended with a Bearer-authentication requirement). Routed
 * behind `@UseGuards(AuthGuard('jwt'), GoogleLinkStartGuard)` — the prior
 * `jwt` guard populates `req.user` (`RequestUser`), which this guard reads
 * to tag the issued state with the caller's own id (`linkingUserId`),
 * proving *LinguaAI*-account ownership; the OAuth handshake that follows
 * proves ownership of the *external* provider account.
 */
@Injectable()
export class GoogleLinkStartGuard extends AuthGuard('google') {
  constructor(private readonly oauthService: OAuthService) {
    super();
  }

  async getAuthenticateOptions(context: ExecutionContext): Promise<{ state: string }> {
    const req = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    return { state: await this.oauthService.createState('GOOGLE', req.user.userId) };
  }
}

@Injectable()
export class AppleLinkStartGuard extends AuthGuard('apple') {
  constructor(private readonly oauthService: OAuthService) {
    super();
  }

  async getAuthenticateOptions(context: ExecutionContext): Promise<{ state: string }> {
    const req = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    return { state: await this.oauthService.createState('APPLE', req.user.userId) };
  }
}

/**
 * Validates+consumes the CSRF `state` **before** calling into Passport's
 * own `canActivate` — which is what actually performs the provider-token
 * exchange via the strategy's `validate()` — satisfying the implementation
 * plan's explicit ordering ("Callback validates `state` first, before any
 * provider-token exchange"). A missing/invalid/expired/reused state throws
 * before Google/Apple is ever contacted. Attaches the consumed state's
 * `linkingUserId` (E2-T12) to the request so `GoogleStrategy.validate()`
 * can tell a linking attempt apart from an ordinary login/register one —
 * this is the one shared callback route both flows use.
 */
@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  constructor(private readonly oauthService: OAuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithOAuthLinking>();
    const { linkingUserId } = await this.oauthService.consumeState(
      'GOOGLE',
      req.query.state as string | undefined,
    );
    req.oauthLinkingUserId = linkingUserId;
    return (await super.canActivate(context)) as boolean;
  }
}

@Injectable()
export class AppleCallbackGuard extends AuthGuard('apple') {
  constructor(private readonly oauthService: OAuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithOAuthLinking>();
    // Apple's response_mode is form_post (Part 8) — state arrives in the
    // POSTed body, not the query string.
    const state =
      (req.query.state as string | undefined) ??
      (req.body as { state?: string } | undefined)?.state;
    const { linkingUserId } = await this.oauthService.consumeState('APPLE', state);
    req.oauthLinkingUserId = linkingUserId;
    return (await super.canActivate(context)) as boolean;
  }
}
