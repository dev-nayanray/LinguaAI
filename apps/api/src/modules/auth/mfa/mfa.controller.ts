import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  mfaVerifyRequestSchema,
  type MfaEnrollResponse,
  type MfaVerifyRequest,
} from '@linguaai/validation/identity';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { RateLimit, RateLimitGuard } from '../../../common/rate-limit/index.js';
import { MFA_VERIFY_RATE_LIMIT } from '../auth-rate-limits.js';
import type { RequestUser } from '../strategies/jwt.strategy.js';
import { MfaService } from './mfa.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/auth/mfa/*` (Part 6) — enrollment only. No `MfaGuard` on these two
 * routes: it's only ever attached to `ADMIN`/`ENTERPRISE_ADMIN`-only
 * business routes (E2-T14), and these enrollment endpoints must remain
 * reachable by an unenrolled admin precisely so they *can* enroll — an
 * `MfaGuard` here would be a deadlock, not a protection.
 */
@ApiTags('auth')
@Controller('auth/mfa')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin TOTP enrollment' })
  async enroll(@Req() req: JwtAuthenticatedRequest): Promise<MfaEnrollResponse> {
    return this.mfaService.beginEnrollment(req.user.userId);
  }

  /**
   * Rate-limited class (Part 8, remediated High-4, E2-T21) — additive to,
   * not a replacement for, `MfaService.completeEnrollment`'s own DB-backed
   * 5-attempt/10-minute lockout: that mechanism is specific to the MFA step
   * itself (Part 8's own text: "an explicit lockout... forcing the caller
   * back to a fresh password/OAuth login"), while this Redis-backed limiter
   * is the same distributed, fail-closed, cross-instance mechanism every
   * other endpoint in this class uses. `AuthGuard('jwt')` (class-level)
   * already ran by the time this method-level guard runs, so `req.user` is
   * populated for `MFA_VERIFY_RATE_LIMIT`'s by-userId counter.
   */
  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  @RateLimit(MFA_VERIFY_RATE_LIMIT)
  @ApiOperation({ summary: 'Confirm TOTP code, complete enrollment' })
  async verify(
    @Req() req: JwtAuthenticatedRequest,
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema)) dto: MfaVerifyRequest,
  ): Promise<void> {
    await this.mfaService.completeEnrollment(req.user.userId, dto.secret, dto.code);
  }
}
