// Certificate bounded context (ARCHITECTURE.md §2.1, PRD.md module 21).
// First real content (E20 T1/T2): the shared `Certificate` wire contract
// both `apps/api/src/modules/certificates` and its own two real producers
// (`ExamsModule`, `CourseModule`) build against. No @linguaai/types
// counterpart exists yet — this module defines its own canonical shapes
// directly, the same precedent @linguaai/validation/analytics/exams
// already established for a bounded context with no @linguaai/types
// module of its own.

import { z } from 'zod';

export const certificateMilestoneTypeSchema = z.enum(['COURSE', 'LEVEL', 'EXAM_PROGRAM']);
export type CertificateMilestoneType = z.infer<typeof certificateMilestoneTypeSchema>;

/**
 * `GET /v1/certificates` — a learner's own certificates, newest first
 * (design doc §5). `courseId`/`levelId`/`examProgramId` mirror
 * `exams.prisma`'s own "exactly one is set" shape exactly — never
 * collapsed into a single discriminated field, so a caller can always
 * tell precisely which milestone triggered a given row without a second
 * lookup.
 */
export const certificateSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid().nullable(),
  levelId: z.string().uuid().nullable(),
  examProgramId: z.string().uuid().nullable(),
  issuedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type CertificateResponse = z.infer<typeof certificateSchema>;

export const certificateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CertificateListQuery = z.infer<typeof certificateListQuerySchema>;

export const certificateListResponseSchema = z.object({
  data: z.array(certificateSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
export type CertificateListResponse = z.infer<typeof certificateListResponseSchema>;

/**
 * `GET /v1/certificates/verify/:token` — real, non-sensitive proof only
 * (design doc §3.4): no `userId`, no email, no `Certificate.id` — a
 * public, unauthenticated endpoint never returns an account identifier a
 * third party could correlate elsewhere. `holderDisplayName` is the same
 * `User.displayName` field already shown throughout this platform's own
 * UI, not a new PII exposure.
 */
export const verifyCertificateResponseSchema = z.object({
  issuedAt: z.string().datetime(),
  milestoneType: certificateMilestoneTypeSchema,
  milestoneName: z.string(),
  holderDisplayName: z.string(),
});
export type VerifyCertificateResponse = z.infer<typeof verifyCertificateResponseSchema>;
