import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { VocabularyCatalogAdminController } from './vocabulary-catalog-admin.controller.js';
import { VocabularyCatalogController } from './vocabulary-catalog.controller.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

/**
 * `VocabularyModule` (E9 T1, §4/§6.1) — `vocabulary.prisma`'s first real
 * application logic. Per ADR-001, vocabulary CRUD lives in `apps/api`
 * directly, not a new microservice (no independent scaling/runtime/
 * blast-radius justification, the same call `CourseModule`/`AssessmentModule`
 * already made for their own domains). Imports `AuthModule` for
 * `RolesGuard`/`MfaGuard` (`ADMIN`-only admin routes) and `AuthGuard('jwt')`
 * (any authenticated user, learner-facing routes).
 */
@Module({
  imports: [AuthModule],
  controllers: [VocabularyCatalogAdminController, VocabularyCatalogController],
  providers: [VocabularyCatalogService],
})
export class VocabularyModule {}
