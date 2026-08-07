import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { ContentVersioningService } from './content-versioning.service.js';
import { CourseHierarchyController } from './course-hierarchy.controller.js';
import { CourseHierarchyService } from './course-hierarchy.service.js';
import { LessonContentController } from './lesson-content.controller.js';
import { LessonContentService } from './lesson-content.service.js';

/**
 * `CourseModule` (E8 T1, §4/§6.1) — `content.prisma`'s first real
 * application logic. Per ADR-001, content CRUD lives in `apps/api`
 * directly, not a new microservice (no independent scaling/runtime/
 * blast-radius justification, `AssessmentModule`/`RecommendationsModule`
 * already made the same call for their own domains). Imports `AuthModule`
 * for `RolesGuard`/`MfaGuard` (`ADMIN`-only, matching `OrganizationsModule`/
 * `AuditController`'s own precedent).
 */
@Module({
  imports: [AuthModule],
  controllers: [CourseHierarchyController, LessonContentController],
  providers: [ContentVersioningService, CourseHierarchyService, LessonContentService],
})
export class CourseModule {}
