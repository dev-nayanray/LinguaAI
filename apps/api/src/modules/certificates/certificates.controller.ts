import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  certificateListQuerySchema,
  type CertificateListQuery,
  type CertificateListResponse,
  type VerifyCertificateResponse,
} from '@linguaai/validation/certificates';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { CERTIFICATE_VERIFY_RATE_LIMIT } from './certificate-rate-limits.js';
import { CertificateService } from './certificate.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/certificates*` (E20 T2, design doc §3.5/§5) — two real, different
 * trust boundaries on the same resource, not one blanket rule: `verify`
 * is deliberately public (the entire point of a "publicly verifiable via
 * unique URL" credential, PRD.md's own module-21 wording), rate-limited
 * per `exams.prisma`'s own already-committed spec (E4 T8); `list` is
 * deliberately the opposite — `AuthGuard('jwt')`, scoped to the caller's
 * own `userId`, the same shape `MockTestAttemptsController`/
 * `ExamCatalogController` already established.
 */
@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificateService: CertificateService) {}

  @Get('verify/:token')
  @UseGuards(RateLimitGuard)
  @RateLimit(CERTIFICATE_VERIFY_RATE_LIMIT)
  @ApiOperation({
    summary:
      'Publicly verify a Certificate by its raw token — real, non-sensitive proof only, no auth required',
  })
  async verify(@Param('token') token: string): Promise<VerifyCertificateResponse> {
    const result = await this.certificateService.verify(token);
    if (!result) {
      throw new NotFoundException('Certificate not found');
    }
    return result;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the caller's own certificates, paginated, newest first" })
  async list(
    @Req() req: JwtAuthenticatedRequest,
    @Query(new ZodValidationPipe(certificateListQuerySchema)) query: CertificateListQuery,
  ): Promise<CertificateListResponse> {
    return this.certificateService.list(req.user.userId, query);
  }
}
