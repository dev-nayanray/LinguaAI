import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { CertificateService } from './certificate.service.js';
import { CertificatesController } from './certificates.controller.js';

/**
 * `CertificatesModule` (E20 T1/T2) — exports the shared `CertificateService`
 * every real `Certificate` producer (`ExamsModule`, `CourseModule`) depends
 * on, and owns the real `/v1/certificates*` endpoints (T2, design doc §5):
 * a public, rate-limited verification route and an authenticated,
 * own-only listing route. `AuthModule` is imported only for
 * `AuthGuard('jwt')`'s own provider, the same pattern every other module
 * with a mixed public/authenticated controller already follows.
 * `RateLimitGuard`'s own `RATE_LIMITER` dependency needs no explicit
 * import here — `RateLimitModule` is `@Global()`.
 */
@Module({
  imports: [AuthModule],
  controllers: [CertificatesController],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificatesModule {}
