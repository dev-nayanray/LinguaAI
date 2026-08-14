import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  mfaChallengeRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshRequestBodySchema,
  registerRequestSchema,
  type LoginResponse,
  type MfaChallengeRequest,
  type OAuthCallbackResponse,
  type PasswordResetConfirmRequest,
  type PasswordResetRequest,
  type PasswordResetRequestResponse,
  type PublicUser,
  type RefreshRequestBody,
  type RefreshResponse,
  type RegisterRequest,
} from '@linguaai/validation/identity';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit/index.js';
import {
  LOGIN_RATE_LIMIT,
  MFA_CHALLENGE_RATE_LIMIT,
  PASSWORD_RESET_REQUEST_RATE_LIMIT,
} from './auth-rate-limits.js';
import { AuthService } from './auth.service.js';
import {
  AppleCallbackGuard,
  AppleStartGuard,
  GoogleCallbackGuard,
  GoogleStartGuard,
} from './guards/oauth.guards.js';
import type { OAuthOutcome } from './oauth.service.js';
import type { RequestUser } from './strategies/jwt.strategy.js';

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Mobile has no cookie jar (ADR-018) — a request carrying this header gets
 * its refresh token in the JSON body instead of a `Set-Cookie` (E21 T1).
 * A plain, self-declared client-type header, not a security boundary: it
 * only ever changes *where* the already-authorized caller's own token is
 * placed, never who is authorized.
 */
const MOBILE_CLIENT_HEADER = 'x-client-platform';

function isMobileClient(req: Request): boolean {
  return req.headers[MOBILE_CLIENT_HEADER] === 'mobile';
}

interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

interface OAuthAuthenticatedRequest extends Request {
  user: OAuthOutcome;
}

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

function cookieOptions(): { httpOnly: true; secure: boolean; sameSite: 'strict' } {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' };
}

function setRefreshCookie(res: Response, rawRefreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, rawRefreshToken, {
    ...cookieOptions(),
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Email/password registration' })
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) dto: RegisterRequest,
  ): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  /**
   * Credential check happens in `LocalStrategy` (Passport's standard
   * mechanism, per Part 7's component design) — NestJS guards run before
   * parameter pipes, so a malformed/missing `email`/`password` fails the
   * credential lookup itself (401), rather than a separate 400 validation
   * step ahead of it. This is the ordinary, well-understood behavior of
   * Passport-based login endpoints, not a gap: a malformed request is still
   * safely rejected either way, only the status code differs from
   * register's Zod-validated 400.
   *
   * `refreshToken` is `null` for the `MFA_REQUIRED` branch (ADR-011's
   * mandatory admin step-up, E2-T22) — no real session/cookie yet, since one
   * doesn't exist until `/mfa/challenge` succeeds.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard, AuthGuard('local'))
  @RateLimit(LOGIN_RATE_LIMIT)
  @ApiOperation({ summary: 'Email/password login' })
  async login(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const deviceLabel = (req.headers['user-agent'] as string | undefined) ?? null;
    const { result, refreshToken } = await this.authService.loginResponse(
      req.user,
      deviceLabel,
      req.ip ?? null,
    );

    if (!refreshToken) {
      return result;
    }
    if (result.status !== 'AUTHENTICATED') {
      // Unreachable in practice — AuthService.loginResponse only ever
      // returns a truthy refreshToken alongside AUTHENTICATED — but kept
      // as an explicit, type-safe guard rather than an unchecked spread
      // onto a union type.
      return result;
    }

    // Mobile (E21 T1): the token travels in the JSON body, no cookie is
    // set — there is no cookie jar to receive it. Web (unchanged): httpOnly/
    // secure/SameSite=strict cookie only (Part 8, SECURITY.md §2), the
    // refresh token never appears in the JSON body.
    if (isMobileClient(req)) {
      return { ...result, refreshToken };
    }
    setRefreshCookie(res, refreshToken);
    return result;
  }

  /**
   * `POST /v1/auth/mfa/challenge` (Part 6, E2-T22) — step two of ADR-011's
   * mandatory admin step-up. No `AuthGuard` here: authentication is
   * possession of the (single-use, 5-minute) challenge token `login`
   * returned, not a Bearer token — the caller has no real session yet, by
   * definition, until this succeeds. `RateLimitGuard` still applies (same
   * "rate-limited + lockout class" as `login`/`mfa/verify`,
   * `auth-rate-limits.ts`'s own doc comment).
   */
  @Post('mfa/challenge')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit(MFA_CHALLENGE_RATE_LIMIT)
  @ApiOperation({ summary: 'Complete MFA step-up login' })
  async mfaChallenge(
    @Body(new ZodValidationPipe(mfaChallengeRequestSchema)) dto: MfaChallengeRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const deviceLabel = (req.headers['user-agent'] as string | undefined) ?? null;
    const { result, refreshToken } = await this.authService.completeMfaChallenge(
      dto.challengeToken,
      dto.code,
      deviceLabel,
      req.ip ?? null,
    );
    if (isMobileClient(req) && result.status === 'AUTHENTICATED') {
      return { ...result, refreshToken };
    }
    setRefreshCookie(res, refreshToken);
    return result;
  }

  /**
   * Rotates the refresh token and mints a new access token (Part 8) — auth
   * is the refresh-token itself, not a Bearer access token (Part 6's
   * endpoint table), so this route has no guard; `AuthService.refreshSession`
   * is where the actual verification/atomicity happens. Web supplies it via
   * cookie (unchanged); mobile (E21 T1, no cookie jar) supplies it via the
   * request body instead — cookie takes precedence when, implausibly, both
   * are present, since it's the original, longer-established transport.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token → new access token' })
  async refresh(
    @Req() req: RequestWithCookies,
    @Body(new ZodValidationPipe(refreshRequestBodySchema)) body: RefreshRequestBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const cookieToken = req.cookies[REFRESH_TOKEN_COOKIE];
    const rawRefreshToken = cookieToken ?? body.refreshToken;
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const { accessToken, refreshToken } = await this.authService.refreshSession(rawRefreshToken);

    if (cookieToken) {
      setRefreshCookie(res, refreshToken);
      return { accessToken };
    }
    return { accessToken, refreshToken };
  }

  /**
   * "Revoke current session" (Part 6). Auth is the Bearer access token
   * (proves who's calling); which session to revoke is resolved from the
   * refresh-token cookie, or — mobile, E21 T1, the same no-cookie-jar
   * fallback as `refresh` above — the request body.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(
    @Req() req: JwtAuthenticatedRequest & RequestWithCookies,
    @Body(new ZodValidationPipe(refreshRequestBodySchema)) body: RefreshRequestBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawRefreshToken = req.cookies[REFRESH_TOKEN_COOKIE] ?? body.refreshToken;
    await this.authService.logout(rawRefreshToken, req.user.userId);
    res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions());
  }

  /**
   * `POST /v1/auth/password-reset/request` (Part 6, E2-T19). No auth
   * guard — unauthenticated by design (the caller has, by definition, no
   * working credentials at this point) — but `RateLimitGuard` still applies
   * (E2-T21): a 429 here is checked before `AuthService.requestPasswordReset`
   * ever runs, so it doesn't disturb that method's own enumeration-resistant
   * response shape (`passwordResetRequestResponseSchema`'s doc comment) —
   * rate-limiting and enumeration-resistance are two independent defenses,
   * not in tension with each other.
   */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit(PASSWORD_RESET_REQUEST_RATE_LIMIT)
  @ApiOperation({ summary: 'Start password reset' })
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema)) dto: PasswordResetRequest,
  ): Promise<PasswordResetRequestResponse> {
    return this.authService.requestPasswordReset(dto.email);
  }

  /** `POST /v1/auth/password-reset/confirm` (Part 6) — authenticated by possession of the (single-use, 1h) reset token itself, not a Bearer token. */
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete password reset' })
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema)) dto: PasswordResetConfirmRequest,
  ): Promise<void> {
    await this.authService.confirmPasswordReset(dto.token, dto.newPassword);
  }

  /** `GoogleStartGuard` issues the CSRF `state` (Part 8) and performs the redirect to Google's consent screen — this body never runs for a fresh flow-start request. */
  @Get('oauth/google')
  @UseGuards(GoogleStartGuard)
  @ApiOperation({ summary: 'Start Google OAuth flow' })
  startGoogle(): void {}

  /** `GoogleCallbackGuard` validates `state` before Passport ever exchanges the code — see guards/oauth.guards.ts. */
  @Get('oauth/google/callback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GoogleCallbackGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: OAuthAuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OAuthCallbackResponse> {
    return this.handleOAuthOutcome(req.user, res);
  }

  @Get('oauth/apple')
  @UseGuards(AppleStartGuard)
  @ApiOperation({ summary: 'Start Apple OAuth flow' })
  startApple(): void {}

  /** Apple's `response_mode` is `form_post` (Part 8) — the callback is a POST, not a GET, unlike Google's. */
  @Post('oauth/apple/callback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AppleCallbackGuard)
  @ApiOperation({ summary: 'Apple OAuth callback' })
  async appleCallback(
    @Req() req: OAuthAuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OAuthCallbackResponse> {
    return this.handleOAuthOutcome(req.user, res);
  }

  private handleOAuthOutcome(outcome: OAuthOutcome, res: Response): OAuthCallbackResponse {
    if (outcome.kind === 'link_required') {
      return { status: 'LINK_REQUIRED', email: outcome.email };
    }
    if (outcome.kind === 'linked') {
      // E2-T12: the caller was already authenticated to reach this point
      // (GoogleLinkStartGuard/AppleLinkStartGuard require a Bearer token) —
      // linking doesn't issue a new session, so no cookie is set here.
      return {
        status: 'LINKED',
        provider: outcome.provider,
        providerAccountId: outcome.providerAccountId,
        linkedAt: outcome.linkedAt,
      };
    }
    setRefreshCookie(res, outcome.refreshToken);
    return { status: 'AUTHENTICATED', accessToken: outcome.accessToken, user: outcome.user };
  }
}
