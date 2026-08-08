import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PersonalDictionary, PrismaClient } from '@linguaai/database';
import type {
  CreatePersonalDictionaryEntryRequest,
  PersonalDictionaryEntryResponse,
  PersonalDictionaryListQuery,
  PersonalDictionaryListResponse,
} from '@linguaai/validation/vocabulary';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { VocabularyCatalogService } from './vocabulary-catalog.service.js';

function toWirePersonalDictionaryEntry(entry: PersonalDictionary): PersonalDictionaryEntryResponse {
  return {
    id: entry.id,
    userId: entry.userId,
    languageId: entry.languageId,
    term: entry.term,
    translation: entry.translation,
    source: entry.source,
    notes: entry.notes,
    vocabularyItemId: entry.vocabularyItemId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/**
 * Personal dictionary (E9 T2, §6.2) — a user-saved word/phrase from any
 * `VocabularySource`, independent of whether a matching curated
 * `VocabularyItem` exists (§3.3's own found asymmetry: `vocabularyItemId`
 * is nullable here, unlike `UserVocabulary`'s later non-nullable FK).
 *
 * `vocabulary.prisma` carries no RLS policy on `PersonalDictionary` (its
 * own header comment) — ownership is enforced by hand, scoping every
 * query to `caller.userId` and returning 404 (not 403) on a cross-user
 * access attempt, the same no-existence-leak discipline
 * `AssessmentService.getOwnedAttempt`/`LearningPlansService` already
 * established.
 */
@Injectable()
export class PersonalDictionaryService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly vocabularyCatalog: VocabularyCatalogService,
  ) {}

  /**
   * A supplied `vocabularyItemId` is validated against the real, non-deleted
   * catalog (§6.2's own "never trusted unchecked" bar) — reuses
   * `VocabularyCatalogService.getById`'s own existence/soft-delete check
   * rather than duplicating it; a 404 from that check propagates as this
   * call's own 404, the same "an invalid referenced entity fails the
   * request with 404" precedent `CourseHierarchyService.createLevel`
   * already established for an invalid `courseId`.
   */
  async create(
    caller: RequestUser,
    dto: CreatePersonalDictionaryEntryRequest,
  ): Promise<PersonalDictionaryEntryResponse> {
    if (dto.vocabularyItemId) {
      await this.vocabularyCatalog.getById(dto.vocabularyItemId);
    }
    const entry = await this.appPrisma.personalDictionary.create({
      data: {
        userId: caller.userId,
        languageId: dto.languageId,
        term: dto.term,
        translation: dto.translation,
        source: dto.source,
        notes: dto.notes,
        vocabularyItemId: dto.vocabularyItemId,
      },
    });
    return toWirePersonalDictionaryEntry(entry);
  }

  /** Keyset (cursor) pagination on `(createdAt desc, id desc)`, mirroring `AuditService.list`'s own established pattern — `id` is a random UUID, the stable tiebreaker only, never the primary sort key. */
  async list(
    caller: RequestUser,
    query: PersonalDictionaryListQuery,
  ): Promise<PersonalDictionaryListResponse> {
    const rows = await this.appPrisma.personalDictionary.findMany({
      where: {
        userId: caller.userId,
        ...(query.languageId ? { languageId: query.languageId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = page[page.length - 1];

    return {
      data: page.map(toWirePersonalDictionaryEntry),
      meta: { nextCursor: hasMore && lastRow ? lastRow.id : null },
    };
  }

  async delete(caller: RequestUser, id: string): Promise<void> {
    await this.getOwnedEntry(caller, id);
    await this.appPrisma.personalDictionary.delete({ where: { id } });
  }

  private async getOwnedEntry(caller: RequestUser, id: string): Promise<PersonalDictionary> {
    const entry = await this.appPrisma.personalDictionary.findUnique({ where: { id } });
    if (!entry || entry.userId !== caller.userId) {
      throw new NotFoundException('Personal dictionary entry not found');
    }
    return entry;
  }
}
