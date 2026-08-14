import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Certificate, PrismaClient } from '@linguaai/database';
import type {
  CertificateListQuery,
  CertificateListResponse,
  VerifyCertificateResponse,
} from '@linguaai/validation/certificates';

import { APP_PRISMA_CLIENT, SERVICE_ROLE_PRISMA_CLIENT } from '../../database/index.js';

/** Exactly one of these three is ever set — mirrors `exams.prisma`'s own hand-written CHECK constraint (E4 T8); the caller is responsible for supplying exactly one. */
export interface CertificateMilestone {
  courseId?: string;
  levelId?: string;
  examProgramId?: string;
}

/** `exams.prisma`'s own documented entropy/hash spec (E4 T8 header comment) — 32 random bytes, base64url-encoded raw token; SHA-256 hex digest is what's actually stored. Mirrors `auth.service.ts`'s own established `hashToken` pattern (`PasswordResetToken`/`MfaChallengeToken`). */
function generateVerificationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function hashRawToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function toWireCertificate(certificate: Certificate): {
  id: string;
  courseId: string | null;
  levelId: string | null;
  examProgramId: string | null;
  issuedAt: string;
  createdAt: string;
} {
  return {
    id: certificate.id,
    courseId: certificate.courseId,
    levelId: certificate.levelId,
    examProgramId: certificate.examProgramId,
    issuedAt: certificate.issuedAt.toISOString(),
    createdAt: certificate.createdAt.toISOString(),
  };
}

/**
 * `CertificateService` (E20 T1, design doc §3.1/§6.1, ADR-059) — the real
 * issuance logic every real `Certificate` producer shares, extracted from
 * `MockTestAttemptsService`'s own already-proven implementation (E19 T3)
 * rather than duplicated for this epic's own second producer
 * (`ExerciseAttemptsService`'s real Level-completion issuance, §6.2). The
 * raw token is returned exactly once, here — never persisted, never
 * recoverable afterward, the same discipline `PasswordResetToken`/
 * `MfaChallengeToken` already established.
 */
@Injectable()
export class CertificateService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    @Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient,
  ) {}

  async issue(
    userId: string,
    milestone: CertificateMilestone,
  ): Promise<{ rawToken: string; certificate: Certificate }> {
    const { rawToken, tokenHash } = generateVerificationToken();
    const certificate = await this.appPrisma.certificate.create({
      data: { userId, ...milestone, verificationTokenHash: tokenHash },
    });
    return { rawToken, certificate };
  }

  /**
   * `GET /v1/certificates/verify/:token` (E20 T2, design doc §3.3/§3.4) —
   * public, unauthenticated. Deliberately uses `servicePrisma`, not
   * `appPrisma` — this route carries no `AuthGuard('jwt')` at all, so
   * `TenantContextInterceptor` never has a `request.user` to set RLS
   * tenant context from; a real `invalid input syntax for type uuid: ''`
   * failure confirmed this the hard way, the same bug class
   * `BillingService.hasEntitlement()` (E15 T2) already hit and fixed for
   * a guard-before-interceptor ordering issue. Safe to bypass RLS here:
   * the 256-bit token itself is the real authorization (unguessable by
   * construction), and the response projection is fixed/non-sensitive
   * regardless of whose data is read (§3.4). Looks up by the SHA-256 hash
   * of the caller-supplied raw token — never a raw-token lookup, matching
   * `PasswordResetToken`'s own established discipline. `null` on no
   * match, the same real, generic "not found" shape (not a distinct
   * "invalid token" vs. "unknown token" signal) `password-reset/request`'s
   * own E2-T19 enumeration-resistance precedent already established.
   */
  async verify(rawToken: string): Promise<VerifyCertificateResponse | null> {
    const certificate = await this.servicePrisma.certificate.findUnique({
      where: { verificationTokenHash: hashRawToken(rawToken) },
      include: {
        user: { select: { displayName: true } },
        course: { select: { title: true } },
        level: { select: { title: true } },
        examProgram: { select: { name: true } },
      },
    });
    if (!certificate) {
      return null;
    }

    const milestone = certificate.course
      ? { milestoneType: 'COURSE' as const, milestoneName: certificate.course.title }
      : certificate.level
        ? { milestoneType: 'LEVEL' as const, milestoneName: certificate.level.title }
        : { milestoneType: 'EXAM_PROGRAM' as const, milestoneName: certificate.examProgram!.name };

    return {
      issuedAt: certificate.issuedAt.toISOString(),
      ...milestone,
      holderDisplayName: certificate.user.displayName,
    };
  }

  /** `GET /v1/certificates` (E20 T2, design doc §5) — own, paginated, newest first, the same "prove a learner can see what they earned" bar `MockTestAttemptsService.list()` (E19 T3) already established. */
  async list(userId: string, query: CertificateListQuery): Promise<CertificateListResponse> {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.appPrisma.certificate.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.appPrisma.certificate.count({ where }),
    ]);
    return {
      data: data.map(toWireCertificate),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
}
