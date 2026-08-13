import { Module } from '@nestjs/common';

import { AiEngineClientModule } from '../ai-engine/ai-engine-client.module.js';
import { AuthModule } from '../auth/index.js';
import { VocabularyModule } from '../vocabulary/index.js';
import { WritingController } from './writing.controller.js';
import { WritingService } from './writing.service.js';

/**
 * `WritingModule` (E13 T2). Imports `AuthModule` for `AuthGuard('jwt')`
 * (`PronunciationModule`'s own precedent), `AiEngineClientModule` —
 * `WritingService`'s real consumer of `AiEngineClientService.correctWriting()`
 * — and `VocabularyModule` for `PersonalDictionaryService`, the same
 * cross-module extraction pattern `SpeakingModule`'s own `endSession()`
 * already established. `DomainEventPublisher` needs no explicit import —
 * `EventsModule` is `@Global()`, the same precedent every other module
 * that publishes events already relies on.
 */
@Module({
  imports: [AuthModule, AiEngineClientModule, VocabularyModule],
  controllers: [WritingController],
  providers: [WritingService],
})
export class WritingModule {}
