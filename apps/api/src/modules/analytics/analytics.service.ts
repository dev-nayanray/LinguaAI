import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type {
  AiCostByDimension,
  AiCostResponse,
  AnalyticsDateRangeQuery,
  CefrProgressionBySkill,
  CefrProgressionQuery,
  CefrProgressionResponse,
} from '@linguaai/validation/analytics';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

/** Real CEFR ordering (content.prisma's own `CefrLevel` enum) — Prisma has no built-in enum-ordinal comparison, so this is the one place that ordering is spelled out explicitly. */
const CEFR_LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const SKILLS = ['READING', 'WRITING', 'LISTENING', 'SPEAKING', 'VOCABULARY', 'GRAMMAR'] as const;

/**
 * `GET /v1/admin/analytics/cefr-progression`/`GET /v1/admin/analytics/ai-cost`
 * (E17 T2, design doc §5). Runs through `app_role` (`APP_PRISMA_CLIENT`) —
 * neither `ProficiencyLevelHistory` nor `AIUsageLog` carries an RLS policy
 * (both are in DATABASE.md §6's own "append-only historical records...
 * anonymized in place" category, deliberately RLS-free), and the real
 * access control here is the `ADMIN`-role gate on the controller itself
 * (design doc §3.6), not row-level security.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(APP_PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * PRD.md §5.1's own named required deliverable: "re-assessment score
   * deltas over time per user/cohort." A cohort-level aggregate, not a
   * per-user drill-down (design doc §3.4/§5) — for each skill, of the
   * users with at least two recorded `ProficiencyLevelHistory` entries
   * for this language within the queried window, how many advanced at
   * least one real CEFR level between their earliest and latest recorded
   * entry. Computed in application code, not a single SQL aggregate —
   * "first/last value per group" has no portable Prisma API, and this is
   * a low-QPS internal admin report, not a hot path (design doc §6.3).
   */
  async getCefrProgression(query: CefrProgressionQuery): Promise<CefrProgressionResponse> {
    const recordedAt: { gte?: Date; lte?: Date } = {};
    if (query.from) {
      recordedAt.gte = new Date(query.from);
    }
    if (query.to) {
      recordedAt.lte = new Date(query.to);
    }

    const rows = await this.prisma.proficiencyLevelHistory.findMany({
      where: {
        languageId: query.languageId,
        userId: { not: null },
        ...(query.from || query.to ? { recordedAt } : {}),
      },
      select: { userId: true, skill: true, cefrLevel: true, recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    });

    const bySkill: CefrProgressionBySkill[] = SKILLS.map((skill) => {
      const skillRows = rows.filter((row) => row.skill === skill);
      const byUser = new Map<string, { first: string; last: string; recordCount: number }>();
      for (const row of skillRows) {
        if (!row.userId) {
          continue;
        }
        const existing = byUser.get(row.userId);
        if (!existing) {
          byUser.set(row.userId, { first: row.cefrLevel, last: row.cefrLevel, recordCount: 1 });
        } else {
          existing.last = row.cefrLevel;
          existing.recordCount += 1;
        }
      }

      let usersWithMultipleRecords = 0;
      let usersAdvanced = 0;
      for (const { first, last, recordCount } of byUser.values()) {
        if (recordCount < 2) {
          continue;
        }
        usersWithMultipleRecords += 1;
        if (
          CEFR_LEVEL_ORDER.indexOf(last as (typeof CEFR_LEVEL_ORDER)[number]) >
          CEFR_LEVEL_ORDER.indexOf(first as (typeof CEFR_LEVEL_ORDER)[number])
        ) {
          usersAdvanced += 1;
        }
      }

      return {
        skill,
        usersWithMultipleRecords,
        usersAdvanced,
        progressionRate:
          usersWithMultipleRecords > 0 ? usersAdvanced / usersWithMultipleRecords : null,
      };
    });

    return {
      languageId: query.languageId,
      from: query.from ?? null,
      to: query.to ?? null,
      bySkill,
    };
  }

  /** The detail breakdown `GET /v1/admin/analytics/overview` (T3) rolls its own single cost-per-active-user figure up from. */
  async getAiCost(query: AnalyticsDateRangeQuery): Promise<AiCostResponse> {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.from) {
      createdAt.gte = new Date(query.from);
    }
    if (query.to) {
      createdAt.lte = new Date(query.to);
    }
    const where = query.from || query.to ? { createdAt } : {};

    const [totals, byPersona, byModel] = await Promise.all([
      this.prisma.aIUsageLog.aggregate({
        where,
        _sum: { costUsdMicros: true },
        _count: true,
      }),
      this.prisma.aIUsageLog.groupBy({
        by: ['agentPersona'],
        where,
        _sum: { costUsdMicros: true },
        _count: true,
      }),
      this.prisma.aIUsageLog.groupBy({
        by: ['modelId'],
        where,
        _sum: { costUsdMicros: true },
        _count: true,
      }),
    ]);

    const toDimension = (
      key: string,
      costUsdMicros: number | null,
      count: number,
    ): AiCostByDimension => ({
      key,
      costUsdMicros: costUsdMicros ?? 0,
      requestCount: count,
    });

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      totalCostUsdMicros: totals._sum.costUsdMicros ?? 0,
      totalRequests: totals._count,
      byAgentPersona: byPersona.map((row) =>
        toDimension(row.agentPersona, row._sum.costUsdMicros, row._count),
      ),
      byModelId: byModel.map((row) => toDimension(row.modelId, row._sum.costUsdMicros, row._count)),
    };
  }
}
