import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { SpeechServiceClientModule } from '../speech-service-client/speech-service-client.module.js';
import { ExamCatalogController } from './exam-catalog.controller.js';
import { ExamCatalogService } from './exam-catalog.service.js';
import { ExamProgramAdminController } from './exam-program-admin.controller.js';
import { ExamProgramService } from './exam-program.service.js';
import { MockTestAttemptsController } from './mock-test-attempts.controller.js';
import { MockTestAttemptsService } from './mock-test-attempts.service.js';
import { MockTestSectionAdminController } from './mock-test-section-admin.controller.js';
import { MockTestSectionService } from './mock-test-section.service.js';

/**
 * `ExamProgram`/`MockTestSection` admin authoring + learner-facing exam
 * discovery and fixed-form mock-test-attempt lifecycle (E19 T1, design doc
 * §5). `AuthModule` is imported only for `AuthGuard('jwt')`/`RolesGuard`/
 * `MfaGuard`'s own providers, the same pattern every other `ADMIN`-gated
 * module already follows (`AnalyticsModule`'s own doc comment).
 * `SpeechServiceClientModule` (E12 T1) backs `MockTestSectionService`'s own
 * real server-side audio synthesis for `LISTENING` content.
 * `AiEngineClientModule` (E19 T2) backs `MockTestAttemptsService`'s own
 * RAG-grounded Writing/Speaking band scoring. `CertificatesModule` (E20 T1)
 * backs its real Certificate issuance on completion, now via the shared
 * `CertificateService` rather than a private, module-local helper.
 * `DomainEventPublisher` needs no explicit import — `EventsModule` is
 * `@Global()`, the same precedent every other module that publishes
 * events already relies on.
 */
@Module({
  imports: [AuthModule, SpeechServiceClientModule, AiEngineClientModule, CertificatesModule],
  controllers: [
    ExamProgramAdminController,
    MockTestSectionAdminController,
    ExamCatalogController,
    MockTestAttemptsController,
  ],
  providers: [
    ExamProgramService,
    MockTestSectionService,
    ExamCatalogService,
    MockTestAttemptsService,
  ],
})
export class ExamsModule {}
