import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import { ContentAuthoringController } from './content-authoring.controller.js';
import { ContentVersioningService } from './content-versioning.service.js';
import { CourseCatalogController } from './course-catalog.controller.js';
import { CourseCatalogService } from './course-catalog.service.js';
import { CourseHierarchyController } from './course-hierarchy.controller.js';
import { CourseHierarchyService } from './course-hierarchy.service.js';
import { ExerciseAttemptsController } from './exercise-attempts.controller.js';
import { ExerciseAttemptsService } from './exercise-attempts.service.js';
import { LessonContentController } from './lesson-content.controller.js';
import { LessonContentService } from './lesson-content.service.js';

/**
 * `CourseModule` (E8 T1-T4, §4/§6.1-6.4) — `content.prisma`'s first real
 * application logic. Per ADR-001, content CRUD lives in `apps/api`
 * directly, not a new microservice (no independent scaling/runtime/
 * blast-radius justification, `AssessmentModule`/`RecommendationsModule`
 * already made the same call for their own domains). Imports `AuthModule`
 * for `RolesGuard`/`MfaGuard` (`ADMIN`-only admin routes) and `AuthGuard('jwt')`
 * (any authenticated user, learner-facing routes), and `AiEngineClientModule`
 * (T4) for `ContentAuthoringController`'s own AI-assisted drafting call.
 */
@Module({
  imports: [AuthModule, AiEngineClientModule],
  controllers: [
    CourseHierarchyController,
    LessonContentController,
    CourseCatalogController,
    ExerciseAttemptsController,
    ContentAuthoringController,
  ],
  providers: [
    ContentVersioningService,
    CourseHierarchyService,
    LessonContentService,
    CourseCatalogService,
    ExerciseAttemptsService,
  ],
})
export class CourseModule {}
