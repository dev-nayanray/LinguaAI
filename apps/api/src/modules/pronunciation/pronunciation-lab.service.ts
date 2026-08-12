import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import {
  pronunciationAttemptScoredPayloadSchema,
  type CreatePronunciationAttemptRequest,
  type PronunciationAttemptResponse,
} from '@linguaai/validation/pronunciation';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { SpeechServiceClientService } from '../speech-service-client/speech-service-client.service.js';
import { languageCodeToBcp47 } from './language-code-to-bcp47.util.js';

/**
 * `PronunciationModule` (E11 T2, design doc §6.2/§6.3). A stateless
 * request/response round trip, not a WebSocket session (ADR-050) — calls
 * `speech-service`'s own scoring endpoint synchronously, then persists the
 * real result itself: `apps/api` already has direct Postgres access to
 * `ai.prisma`'s tables, the same ownership split T5's own
 * `FluencyScoringService`/`ai-engine` pairing established for a different
 * (session-routed) reason.
 */
@Injectable()
export class PronunciationLabService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly speechServiceClient: SpeechServiceClientService,
    private readonly events: DomainEventPublisher,
  ) {}

  async createAttempt(
    caller: RequestUser,
    dto: CreatePronunciationAttemptRequest,
  ): Promise<PronunciationAttemptResponse> {
    const language = await this.appPrisma.language.findUnique({
      where: { id: dto.languageId },
    });
    if (!language) {
      throw new NotFoundException('Language not found');
    }
    const languageCode = languageCodeToBcp47(language.code);

    const score = await this.speechServiceClient.scorePronunciation(
      dto.audio,
      dto.targetPhrase,
      languageCode,
    );

    const attempt = await this.appPrisma.pronunciationLabAttempt.create({
      data: {
        userId: caller.userId,
        languageId: dto.languageId,
        targetPhrase: dto.targetPhrase,
      },
    });

    await this.appPrisma.pronunciationScore.create({
      data: {
        userId: caller.userId,
        sourceType: 'PRONUNCIATION_LAB_ATTEMPT',
        sourceId: attempt.id,
        phonemeScores: score.words,
        overallScore: score.overallScore,
      },
    });

    const eventPayload = pronunciationAttemptScoredPayloadSchema.parse({
      attemptId: attempt.id,
      languageId: dto.languageId,
      overallScore: score.overallScore,
      accuracyScore: score.accuracyScore,
      fluencyScore: score.fluencyScore,
      completenessScore: score.completenessScore,
    });
    await this.events.publish('pronunciation.attempt.scored', {
      userId: caller.userId,
      payload: eventPayload,
    });

    return {
      attemptId: attempt.id,
      languageId: dto.languageId,
      targetPhrase: dto.targetPhrase,
      score,
      createdAt: attempt.createdAt.toISOString(),
    };
  }
}
