import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import { VocabularyModule } from '../vocabulary/index.js';
import { StoryController } from './story.controller.js';
import { StoryService } from './story.service.js';
import { WritingController } from './writing.controller.js';
import { WritingService } from './writing.service.js';

/**
 * `WritingModule` (E13 T2/T3, design doc §4/§6.2/§6.3) — owns both PRD
 * modules this epic covers (Writing Assistant, AI Story Generator).
 * Imports `AuthModule` for `AuthGuard('jwt')` (`PronunciationModule`'s
 * own precedent), `AiEngineClientModule` — `WritingService`'s/`StoryService`'s
 * real consumer of `AiEngineClientService.correctWriting()`/`draftStory()`
 * — and `VocabularyModule` for `PersonalDictionaryService`, the same
 * cross-module extraction pattern `SpeakingModule`'s own `endSession()`
 * already established. `DomainEventPublisher` needs no explicit import —
 * `EventsModule` is `@Global()`, the same precedent every other module
 * that publishes events already relies on.
 */
@Module({
  imports: [AuthModule, AiEngineClientModule, VocabularyModule],
  controllers: [WritingController, StoryController],
  providers: [WritingService, StoryService],
})
export class WritingModule {}
