import { Module } from '@nestjs/common';

import { CertificateService } from './certificate.service.js';

/**
 * `CertificatesModule` (E20 T1) — exports the shared `CertificateService`
 * every real `Certificate` producer (`ExamsModule`, `CourseModule`) depends
 * on. No controller of its own at T1 — the public verification endpoint
 * and learner-facing listing are T2's own scope.
 */
@Module({
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificatesModule {}
