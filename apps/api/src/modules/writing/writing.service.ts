import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import {
  writingSubmissionCorrectedPayloadSchema,
  type CreateWritingSubmissionRequest,
  type WritingSubmissionResponse,
} from '@linguaai/validation/ai-coaching';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { PersonalDictionaryService } from '../vocabulary/index.js';

/**
 * `WritingModule` (E13 T2, design doc §6.2). A stateless request/response
 * round trip, not a WebSocket session (ADR-052, mirroring ADR-050's own
 * reasoning) — calls `ai-engine`'s writing-coaching endpoint synchronously,
 * then persists the real result itself: `apps/api` already has direct
 * Postgres access to `ai.prisma`'s tables, the same ownership split T2's
 * own `PronunciationLabService`/`ai-engine` pairing already established.
 */
@Injectable()
export class WritingService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly aiEngineClient: AiEngineClientService,
    private readonly personalDictionary: PersonalDictionaryService,
    private readonly events: DomainEventPublisher,
  ) {}

  async submitWriting(
    caller: RequestUser,
    dto: CreateWritingSubmissionRequest,
  ): Promise<WritingSubmissionResponse> {
    const language = await this.appPrisma.language.findUnique({ where: { id: dto.languageId } });
    if (!language) {
      throw new NotFoundException('Language not found');
    }

    const result = await this.aiEngineClient.correctWriting({
      languageId: dto.languageId,
      targetLanguageName: language.name,
      text: dto.text,
    });

    const submission = await this.appPrisma.writingSubmission.create({
      data: {
        userId: caller.userId,
        languageId: dto.languageId,
        text: dto.text,
        corrections: result.corrections,
        overallFeedback: result.overallFeedback,
        cefrLevelEstimate: result.cefrLevelEstimate,
      },
    });

    for (const correction of result.corrections) {
      await this.personalDictionary.create(caller, {
        languageId: dto.languageId,
        term: correction.corrected,
        source: 'WRITING',
        notes: correction.explanation,
      });
    }

    const eventPayload = writingSubmissionCorrectedPayloadSchema.parse({
      submissionId: submission.id,
      languageId: dto.languageId,
      correctionCount: result.corrections.length,
      cefrLevelEstimate: result.cefrLevelEstimate,
    });
    await this.events.publish('writing.submission.corrected', {
      userId: caller.userId,
      payload: eventPayload,
    });

    return {
      submissionId: submission.id,
      languageId: dto.languageId,
      text: dto.text,
      corrections: result.corrections,
      overallFeedback: result.overallFeedback,
      cefrLevelEstimate: result.cefrLevelEstimate,
      createdAt: submission.createdAt.toISOString(),
    };
  }
}
