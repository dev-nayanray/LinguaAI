import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { GamificationController } from './gamification.controller.js';
import { GamificationService } from './gamification.service.js';

/**
 * `GamificationModule` (E14 T1, design doc §4). Imports `AuthModule` for
 * `AuthGuard('jwt')`, matching every other learner-facing module's own
 * precedent. `DomainEventPublisher` needs no explicit import —
 * `EventsModule` is `@Global()`. `GamificationService` is exported so
 * `CourseModule` (T1's own synchronous call site, ADR-054) can inject it
 * directly, the same cross-module pattern `VocabularyModule` already
 * established for `PersonalDictionaryService`.
 */
@Module({
  imports: [AuthModule],
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
