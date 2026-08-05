import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppleLinkStartGuard, GoogleLinkStartGuard } from './guards/oauth.guards.js';

/**
 * `POST /v1/users/me/oauth-accounts` (Part 6, E2-T12) — "link an OAuth
 * provider to the current account." A separate controller (not folded into
 * `AuthController`, whose `@Controller('auth')` prefix would make these
 * routes `/auth/users/me/...`) so the path matches Part 6's documented
 * `/users/me/oauth-accounts` shape, while the OAuth machinery it depends on
 * (`OAuthService`, the guards, the shared callback routes) stays in
 * `AuthModule` rather than crossing into `UsersModule`.
 *
 * These are the concrete *start* routes for a redirect-based linking flow —
 * see `guards/oauth.guards.ts`'s `GoogleLinkStartGuard`/`AppleLinkStartGuard`
 * doc comments for why a GET-redirect pair is needed to implement the
 * documented POST capability (the same templated-path-to-concrete-route
 * translation `AuthController`'s login-flow OAuth routes already use, E2-T11).
 * The callback that actually completes linking is the *same* shared
 * `/v1/auth/oauth/{google,apple}/callback` route login uses — Google/Apple's
 * registered callback URL is fixed per strategy, not swappable per-request.
 */
@ApiTags('users')
@Controller('users/me/oauth-accounts')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class OAuthLinkController {
  @Get('link/google')
  @UseGuards(GoogleLinkStartGuard)
  @ApiOperation({
    summary: 'Start linking a Google account to the current (authenticated) account',
  })
  startGoogleLink(): void {}

  @Get('link/apple')
  @UseGuards(AppleLinkStartGuard)
  @ApiOperation({
    summary: 'Start linking an Apple account to the current (authenticated) account',
  })
  startAppleLink(): void {}
}
