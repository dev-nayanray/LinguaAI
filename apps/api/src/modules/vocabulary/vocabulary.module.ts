import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import { PersonalDictionaryController } from './personal-dictionary.controller.js';
import { PersonalDictionaryService } from './personal-dictionary.service.js';
import { SrsDeckController } from './srs-deck.controller.js';
import { SrsDeckService } from './srs-deck.service.js';
import { VocabularyAuthoringController } from './vocabulary-authoring.controller.js';
import { VocabularyCatalogAdminController } from './vocabulary-catalog-admin.controller.js';
import { VocabularyCatalogController } from './vocabulary-catalog.controller.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

/**
 * `VocabularyModule` (E9 T1-T4, §4/§6.1-6.4) — `vocabulary.prisma`'s first
 * real application logic. Per ADR-001, vocabulary CRUD lives in `apps/api`
 * directly, not a new microservice (no independent scaling/runtime/
 * blast-radius justification, the same call `CourseModule`/`AssessmentModule`
 * already made for their own domains). Imports `AuthModule` for
 * `RolesGuard`/`MfaGuard` (`ADMIN`-only admin routes) and `AuthGuard('jwt')`
 * (any authenticated user, learner-facing routes), and `AiEngineClientModule`
 * (T4) for `VocabularyAuthoringController`'s own AI-assisted drafting call.
 * `PersonalDictionaryService`/`SrsDeckService` both depend on
 * `VocabularyCatalogService` (T2/T3) to validate a `vocabularyItemId`
 * against the real catalog. `SrsDeckService` (T3, ADR-042) is the
 * SM-2-derivative scheduling algorithm's own home — a deliberate departure
 * from ARCHITECTURE.md §2.1's literal `recommendation-engine` example,
 * documented in full in that ADR.
 */
@Module({
  imports: [AuthModule, AiEngineClientModule],
  controllers: [
    VocabularyCatalogAdminController,
    VocabularyCatalogController,
    PersonalDictionaryController,
    SrsDeckController,
    VocabularyAuthoringController,
  ],
  providers: [VocabularyCatalogService, PersonalDictionaryService, SrsDeckService],
  // `PersonalDictionaryService` (E10 T5) is the first cross-module export
  // here — `SpeakingModule`'s own session-end vocabulary extraction
  // (design doc §6.4) needs it directly, the same "consume a public
  // export, never reach into another module's own internals" rule this
  // repo's own dependency-boundary lint (ADR-015) already enforces.
  exports: [PersonalDictionaryService],
})
export class VocabularyModule {}
