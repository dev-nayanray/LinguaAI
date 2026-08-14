import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type {
  AiCostByDimension,
  AiCostResponse,
  AnalyticsDateRangeQuery,
  CefrProgressionBySkill,
  CefrProgressionQuery,
  CefrProgressionResponse,
  OverviewResponse,
  RateWithCounts,
} from '@linguaai/validation/analytics';

import { APP_PRISMA_CLIENT } from '../../database/index.js';

/** Real CEFR ordering (content.prisma's own `CefrLevel` enum) — Prisma has no built-in enum-ordinal comparison, so this is the one place that ordering is spelled out explicitly. */
const CEFR_LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const SKILLS = ['READING', 'WRITING', 'LISTENING', 'SPEAKING', 'VOCABULARY', 'GRAMMAR'] as const;

/** `EVENT_ARCHITECTURE.md`'s own real, cataloged event type strings — PRD.md §7's own "assessment + first lesson" activation definition. */
const ASSESSMENT_COMPLETED_EVENT = 'assessment.attempt.completed';
const LESSON_COMPLETED_EVENT = 'learning.lesson.completed';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;
const EMPTY_RATE: RateWithCounts = { cohortSize: 0, count: 0, rate: null };

/** UTC calendar-date string (`YYYY-MM-DD`) — retention is "did this user do anything on this exact calendar day," not a rolling 24h window. */
function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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

  /**
   * `GET /v1/admin/analytics/overview` (E17 T3) — PRD.md §7's own named
   * core business metrics. The cohort for activation/retention/conversion
   * is "users whose `User.createdAt` falls in `[from, to]`" — `from`/`to`
   * default to the last 30 days when omitted (a reasonable admin-report
   * default, not PRD-specified). AI cost per active user is deliberately
   * **not** cohort-scoped — it's a period-wide figure (every active user
   * in the window, not only new signups), matching PRD's own "AI cost per
   * active user" wording rather than narrowing it to new users only.
   */
  async getOverview(query: AnalyticsDateRangeQuery): Promise<OverviewResponse> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - THIRTY_DAYS_MS);

    const cohort = await this.prisma.user.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true },
    });

    const [activation, retention, conversion, aiCostPerActiveUser] = await Promise.all([
      this.computeActivation(cohort),
      this.computeRetention(cohort),
      this.computeConversion(cohort),
      this.computeAiCostPerActiveUser(from, to),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      activation,
      retention,
      conversion,
      aiCostPerActiveUser,
    };
  }

  private async computeActivation(
    cohort: { id: string; createdAt: Date }[],
  ): Promise<RateWithCounts> {
    if (cohort.length === 0) {
      return EMPTY_RATE;
    }

    const events = await this.prisma.learningEvent.findMany({
      where: {
        userId: { in: cohort.map((user) => user.id) },
        type: { in: [ASSESSMENT_COMPLETED_EVENT, LESSON_COMPLETED_EVENT] },
      },
      select: { userId: true, type: true, occurredAt: true },
    });

    const createdAtByUser = new Map(cohort.map((user) => [user.id, user.createdAt]));
    const typesWithin24hByUser = new Map<string, Set<string>>();
    for (const event of events) {
      const signupAt = event.userId ? createdAtByUser.get(event.userId) : undefined;
      if (!event.userId || !signupAt) {
        continue;
      }
      const elapsedMs = event.occurredAt.getTime() - signupAt.getTime();
      if (elapsedMs < 0 || elapsedMs > ONE_DAY_MS) {
        continue;
      }
      const types = typesWithin24hByUser.get(event.userId) ?? new Set<string>();
      types.add(event.type);
      typesWithin24hByUser.set(event.userId, types);
    }

    const activatedCount = [...typesWithin24hByUser.values()].filter(
      (types) => types.has(ASSESSMENT_COMPLETED_EVENT) && types.has(LESSON_COMPLETED_EVENT),
    ).length;

    return {
      cohortSize: cohort.length,
      count: activatedCount,
      rate: activatedCount / cohort.length,
    };
  }

  private async computeRetention(
    cohort: { id: string; createdAt: Date }[],
  ): Promise<OverviewResponse['retention']> {
    if (cohort.length === 0) {
      return { d1: EMPTY_RATE, d7: EMPTY_RATE, d30: EMPTY_RATE };
    }

    const events = await this.prisma.learningEvent.findMany({
      where: { userId: { in: cohort.map((user) => user.id) } },
      select: { userId: true, occurredAt: true },
    });

    const eventDatesByUser = new Map<string, Set<string>>();
    for (const event of events) {
      if (!event.userId) {
        continue;
      }
      const dates = eventDatesByUser.get(event.userId) ?? new Set<string>();
      dates.add(utcDateString(event.occurredAt));
      eventDatesByUser.set(event.userId, dates);
    }

    const rateForDayOffset = (dayOffset: number): RateWithCounts => {
      const count = cohort.filter((user) => {
        const targetDate = utcDateString(
          new Date(user.createdAt.getTime() + dayOffset * ONE_DAY_MS),
        );
        return eventDatesByUser.get(user.id)?.has(targetDate) ?? false;
      }).length;
      return { cohortSize: cohort.length, count, rate: count / cohort.length };
    };

    return { d1: rateForDayOffset(1), d7: rateForDayOffset(7), d30: rateForDayOffset(30) };
  }

  private async computeConversion(cohort: { id: string }[]): Promise<RateWithCounts> {
    if (cohort.length === 0) {
      return EMPTY_RATE;
    }

    const converted = await this.prisma.entitlement.findMany({
      where: {
        userId: { in: cohort.map((user) => user.id) },
        plan: { tier: { not: 'FREE' } },
      },
      select: { userId: true },
    });

    return {
      cohortSize: cohort.length,
      count: converted.length,
      rate: converted.length / cohort.length,
    };
  }

  private async computeAiCostPerActiveUser(
    from: Date,
    to: Date,
  ): Promise<OverviewResponse['aiCostPerActiveUser']> {
    const [totals, activeUsers] = await Promise.all([
      this.prisma.aIUsageLog.aggregate({
        where: { createdAt: { gte: from, lte: to } },
        _sum: { costUsdMicros: true },
      }),
      this.prisma.learningEvent.findMany({
        where: { occurredAt: { gte: from, lte: to }, userId: { not: null } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const totalCostUsdMicros = totals._sum.costUsdMicros ?? 0;
    const activeUserCount = activeUsers.length;

    return {
      totalCostUsdMicros,
      activeUserCount,
      costPerActiveUserUsdMicros: activeUserCount > 0 ? totalCostUsdMicros / activeUserCount : null,
    };
  }
}
