import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient, type VocabularyItem } from '@linguaai/database';
import type {
  CreateVocabularyItemRequest,
  UpdateVocabularyItemRequest,
  VocabularyItemListQuery,
  VocabularyItemListResponse,
  VocabularyItemResponse,
} from '@linguaai/validation/vocabulary';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

function toWireVocabularyItem(item: VocabularyItem): VocabularyItemResponse {
  return {
    id: item.id,
    languageId: item.languageId,
    term: item.term,
    partOfSpeech: item.partOfSpeech,
    translations: item.translations as Record<string, unknown>,
    audioUrl: item.audioUrl,
    exampleSentences: item.exampleSentences as unknown[] | null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Curated `VocabularyItem` catalog (E9 T1, §6.1). `ADMIN`-authored
 * (`VocabularyCatalogAdminController`), read by any authenticated learner
 * (`VocabularyCatalogController`) — both controllers share this one
 * service, the same "one service, two controllers split by audience"
 * shape `CourseHierarchyController`/`CourseCatalogController` already
 * established for `content.prisma`.
 *
 * `vocabulary.prisma` carries no RLS policy and no `organizationId` column
 * on `VocabularyItem` (its own header comment, confirmed by direct
 * inspection) — `APP_PRISMA_CLIENT` throughout, the same ordinary
 * `app_role` connection every other unpoliced-table service already uses.
 * Unlike `Course`, `VocabularyItem` has no `publishedAt`/draft state
 * (design doc §6.1, §8) — a created, non-deleted item is immediately
 * catalog-visible.
 */
@Injectable()
export class VocabularyCatalogService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient) {}

  async create(dto: CreateVocabularyItemRequest): Promise<VocabularyItemResponse> {
    const item = await this.appPrisma.vocabularyItem.create({
      data: {
        languageId: dto.languageId,
        term: dto.term,
        partOfSpeech: dto.partOfSpeech,
        translations: dto.translations,
        audioUrl: dto.audioUrl,
        exampleSentences: dto.exampleSentences as Prisma.InputJsonValue | undefined,
      },
    });
    return toWireVocabularyItem(item);
  }

  async update(id: string, dto: UpdateVocabularyItemRequest): Promise<VocabularyItemResponse> {
    await this.getOwnedItem(id);
    const item = await this.appPrisma.vocabularyItem.update({
      where: { id },
      data: {
        term: dto.term,
        partOfSpeech: dto.partOfSpeech,
        translations: dto.translations,
        audioUrl: dto.audioUrl,
        // `exampleSentences` is a nullable Json column — Prisma requires
        // the `Prisma.JsonNull` sentinel to clear it to SQL NULL (a bare
        // `null` is only valid for a non-nullable Json field, ADR-030's
        // own Json-handling precedent). `undefined` (not present in the
        // request) leaves the column untouched.
        exampleSentences:
          dto.exampleSentences === null
            ? Prisma.JsonNull
            : (dto.exampleSentences as Prisma.InputJsonValue | undefined),
      },
    });
    return toWireVocabularyItem(item);
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedItem(id);
    await this.appPrisma.vocabularyItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getById(id: string): Promise<VocabularyItemResponse> {
    return toWireVocabularyItem(await this.getOwnedItem(id));
  }

  async list(query: VocabularyItemListQuery): Promise<VocabularyItemListResponse> {
    const where: Prisma.VocabularyItemWhereInput = {
      deletedAt: null,
      ...(query.languageId ? { languageId: query.languageId } : {}),
      ...(query.search ? { term: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.appPrisma.vocabularyItem.findMany({
        where,
        orderBy: { term: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.appPrisma.vocabularyItem.count({ where }),
    ]);
    return {
      data: items.map(toWireVocabularyItem),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** 404, not a bare Prisma null — API_GUIDELINES.md §3's no-existence-leak rule, matching `CourseHierarchyService.getOwnedCourse`'s own precedent. Soft-deleted items are treated as not-found, never served. */
  private async getOwnedItem(id: string): Promise<VocabularyItem> {
    const item = await this.appPrisma.vocabularyItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Vocabulary item not found');
    }
    return item;
  }
}
