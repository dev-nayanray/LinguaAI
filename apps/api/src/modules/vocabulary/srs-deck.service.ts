import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient, UserVocabulary } from '@linguaai/database';
import type {
  AddToDeckRequest,
  DueDeckListQuery,
  DueDeckListResponse,
  UserVocabularyEntryResponse,
} from '@linguaai/validation/vocabulary';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { applySm2Review } from './srs-scheduling.util.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function toWireUserVocabularyEntry(entry: UserVocabulary): UserVocabularyEntryResponse {
  return {
    id: entry.id,
    userId: entry.userId,
    vocabularyItemId: entry.vocabularyItemId,
    easeFactor: entry.easeFactor,
    intervalDays: entry.intervalDays,
    repetitions: entry.repetitions,
    nextReviewAt: entry.nextReviewAt.toISOString(),
    lastReviewedAt: entry.lastReviewedAt ? entry.lastReviewedAt.toISOString() : null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/**
 * SRS review engine (E9 T3, §6.3, ADR-042) — the PRD's own literal
 * "SRS scheduling follows a documented algorithm (SM-2 derivative)"
 * acceptance bar for this module. Deliberately lives in `apps/api`, not
 * `recommendation-engine`, despite ARCHITECTURE.md §2.1 naming "SRS
 * scheduling" by name as a `recommendation-engine` example — flashcard
 * review is a synchronous, per-request learner action needing an
 * immediate response, and `recommendation-engine`'s own real code (E7)
 * is exclusively asynchronous with zero public HTTP surface to any
 * frontend. Full reasoning in ADR-042 (DECISIONS.md).
 *
 * `vocabulary.prisma` carries no RLS policy on `UserVocabulary` — the
 * same by-hand ownership discipline `PersonalDictionaryService` already
 * established (404, not 403, on a cross-user access attempt).
 */
@Injectable()
export class SrsDeckService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly vocabularyCatalog: VocabularyCatalogService,
  ) {}

  /**
   * Idempotent: adding an already-added `VocabularyItem` returns the
   * existing row unchanged rather than erroring (design doc §6.3), a safe
   * "add to my deck" action to call twice. `vocabularyItemId` is
   * validated against the real, non-deleted catalog first (reusing
   * `VocabularyCatalogService.getById`, the same pattern
   * `PersonalDictionaryService.create` already established), so an
   * invalid reference fails the whole request with 404 before any write
   * is attempted.
   */
  async addToDeck(
    caller: RequestUser,
    dto: AddToDeckRequest,
  ): Promise<UserVocabularyEntryResponse> {
    await this.vocabularyCatalog.getById(dto.vocabularyItemId);
    const entry = await this.appPrisma.userVocabulary.upsert({
      where: {
        userId_vocabularyItemId: { userId: caller.userId, vocabularyItemId: dto.vocabularyItemId },
      },
      create: { userId: caller.userId, vocabularyItemId: dto.vocabularyItemId },
      update: {},
    });
    return toWireUserVocabularyEntry(entry);
  }

  /**
   * Cards due for review (`nextReviewAt <= now()`), cursor-paginated on
   * `(nextReviewAt asc, id asc)` — the order a learner would actually work
   * through their due deck, oldest-due first. A learner may also review a
   * not-yet-due card via `submitReview` directly (§6.3's own deliberate
   * "cramming is allowed" call) — this endpoint only surfaces what's
   * actually due today, it doesn't gate review itself.
   */
  async listDue(caller: RequestUser, query: DueDeckListQuery): Promise<DueDeckListResponse> {
    const rows = await this.appPrisma.userVocabulary.findMany({
      where: { userId: caller.userId, nextReviewAt: { lte: new Date() } },
      orderBy: [{ nextReviewAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = page[page.length - 1];

    return {
      data: page.map(toWireUserVocabularyEntry),
      meta: { nextCursor: hasMore && lastRow ? lastRow.id : null },
    };
  }

  /**
   * Applies the SM-2-derivative transition (`applySm2Review`, a pure
   * function) and persists the result. `intervalDays` is converted into a
   * real `nextReviewAt` timestamp here — the caller's own wall-clock
   * concern, not the pure scheduling function's.
   */
  async submitReview(
    caller: RequestUser,
    id: string,
    quality: number,
  ): Promise<UserVocabularyEntryResponse> {
    const existing = await this.getOwnedEntry(caller, id);
    const next = applySm2Review(existing, quality);
    const now = new Date();
    const updated = await this.appPrisma.userVocabulary.update({
      where: { id },
      data: {
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        nextReviewAt: new Date(now.getTime() + next.intervalDays * MILLISECONDS_PER_DAY),
        lastReviewedAt: now,
      },
    });
    return toWireUserVocabularyEntry(updated);
  }

  private async getOwnedEntry(caller: RequestUser, id: string): Promise<UserVocabulary> {
    const entry = await this.appPrisma.userVocabulary.findUnique({ where: { id } });
    if (!entry || entry.userId !== caller.userId) {
      throw new NotFoundException('Deck entry not found');
    }
    return entry;
  }
}
