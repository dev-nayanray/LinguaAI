import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { PersonalDictionaryController } from './personal-dictionary.controller.js';
import { PersonalDictionaryService } from './personal-dictionary.service.js';
import { SrsDeckController } from './srs-deck.controller.js';
import { SrsDeckService } from './srs-deck.service.js';
import { VocabularyCatalogAdminController } from './vocabulary-catalog-admin.controller.js';
import { VocabularyCatalogController } from './vocabulary-catalog.controller.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

/**
 * `VocabularyModule` (E9 T1-T3, §4/§6.1-6.3) — `vocabulary.prisma`'s first
 * real application logic. Per ADR-001, vocabulary CRUD lives in `apps/api`
 * directly, not a new microservice (no independent scaling/runtime/
 * blast-radius justification, the same call `CourseModule`/`AssessmentModule`
 * already made for their own domains). Imports `AuthModule` for
 * `RolesGuard`/`MfaGuard` (`ADMIN`-only admin routes) and `AuthGuard('jwt')`
 * (any authenticated user, learner-facing routes). `PersonalDictionaryService`/
 * `SrsDeckService` both depend on `VocabularyCatalogService` (T2/T3) to
 * validate a `vocabularyItemId` against the real catalog. `SrsDeckService`
 * (T3, ADR-042) is the SM-2-derivative scheduling algorithm's own home —
 * a deliberate departure from ARCHITECTURE.md §2.1's literal
 * `recommendation-engine` example, documented in full in that ADR.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    VocabularyCatalogAdminController,
    VocabularyCatalogController,
    PersonalDictionaryController,
    SrsDeckController,
  ],
  providers: [VocabularyCatalogService, PersonalDictionaryService, SrsDeckService],
})
export class VocabularyModule {}
