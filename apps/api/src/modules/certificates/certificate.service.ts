import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Certificate, PrismaClient } from '@linguaai/database';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

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
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

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
}
