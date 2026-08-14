import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import { DomainEventPublisher } from '@linguaai/events';
import type { Logger } from '@linguaai/observability';
import { LOGGER } from '@linguaai/observability/nestjs';
import { toLocalCalendarDate } from '@linguaai/utils';
import type {
  EarnedBadgeResponse,
  GamificationStatusResponse,
  GamificationXpAwardedPayload,
  MissionMetric,
  MissionProgressResponse,
} from '@linguaai/validation/gamification';
import {
  earnedBadgeResponseSchema,
  gamificationBadgeAwardedPayloadSchema,
  gamificationStreakUpdatedPayloadSchema,
  gamificationXpAwardedPayloadSchema,
  missionProgressResponseSchema,
} from '@linguaai/validation/gamification';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { computeStreakUpdate } from './streak-update.util.js';
import {
  computeLevel,
  XP_PER_CORRECT_FIRST_ATTEMPT,
  XP_PER_LESSON_COMPLETION,
} from './xp-level.util.js';

export type RecordActivityInput =
  | { type: 'EXERCISE_ANSWERED'; correct: boolean; firstAttempt: boolean }
  | { type: 'LESSON_COMPLETED' };

interface BadgeCriteria {
  type: 'STREAK_DAYS' | 'LESSONS_COMPLETED' | 'XP_EARNED';
  threshold: number;
}

const BADGE_CRITERIA_TYPES = new Set(['STREAK_DAYS', 'LESSONS_COMPLETED', 'XP_EARNED']);

function parseBadgeCriteria(raw: unknown): BadgeCriteria | null {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'type' in raw &&
    'threshold' in raw &&
    typeof (raw as { threshold: unknown }).threshold === 'number' &&
    BADGE_CRITERIA_TYPES.has((raw as { type: unknown }).type as string)
  ) {
    return raw as BadgeCriteria;
  }
  return null;
}

function toDateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

interface ActivitySignal {
  xpDelta: number;
  lessonCompleted: boolean;
  currentStreak: number;
}

/**
 * `GamificationModule` (E14 T1/T2, design doc §6). `recordActivity()` is
 * the one real entry point — called synchronously, in-process, from
 * `ExerciseAttemptsService`'s own existing event-publishing call sites
 * (ADR-054), never a new async domain-event consumer (avoiding
 * RISK_REGISTER R-89's own already-tracked competing-consumers gap).
 * Every call updates the streak (any real activity counts as "practiced
 * today," independent of whether it earns XP); XP is additionally
 * gated per activity type (§3.3's own anti-farming rule for exercises).
 * T2 adds badge-earning and mission-progress tracking, evaluated after
 * every real XP/streak/lesson-count change in the same call.
 */
@Injectable()
export class GamificationService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly events: DomainEventPublisher,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async recordActivity(userId: string, activity: RecordActivityInput): Promise<void> {
    const { currentStreak } = await this.updateStreak(userId);

    let xpDelta = 0;
    let lessonCompleted = false;

    if (activity.type === 'EXERCISE_ANSWERED') {
      // Anti-farming (§3.3): XP only on the learner's own first-ever,
      // correct attempt at this specific exercise — a repeat attempt
      // (right or wrong) earns zero XP, closing the most obvious
      // unlimited-re-answer farming vector this schema's own shape
      // invites (ExerciseAttempt has no re-attempt limit).
      if (activity.firstAttempt && activity.correct) {
        await this.awardXp(userId, XP_PER_CORRECT_FIRST_ATTEMPT, 'EXERCISE_ANSWERED');
        xpDelta = XP_PER_CORRECT_FIRST_ATTEMPT;
      }
    } else {
      // LESSON_COMPLETED: `ExerciseAttemptsService.maybeEmitLessonCompleted()`
      // is itself only ever invoked once per (userId, lessonId) pair — it
      // only runs on a first-time exercise attempt, and only actually
      // publishes once every attemptable exercise in the lesson has been
      // attempted at least once, a transition that can happen at most once.
      // Confirmed by direct inspection during T1's own implementation, not
      // assumed — no separate idempotency guard is needed here.
      await this.appPrisma.userXP.upsert({
        where: { userId },
        create: { userId, totalXp: 0, level: 1, lessonsCompleted: 1 },
        update: { lessonsCompleted: { increment: 1 } },
      });
      await this.awardXp(userId, XP_PER_LESSON_COMPLETION, 'LESSON_COMPLETED');
      xpDelta = XP_PER_LESSON_COMPLETION;
      lessonCompleted = true;
    }

    await this.applyMissionProgress(userId, { xpDelta, lessonCompleted, currentStreak });
    await this.evaluateBadges(userId);
  }

  async getStatus(userId: string): Promise<GamificationStatusResponse> {
    const [userXp, streak] = await Promise.all([
      this.appPrisma.userXP.findUnique({ where: { userId } }),
      this.appPrisma.streak.findUnique({ where: { userId } }),
    ]);
    return {
      totalXp: userXp?.totalXp ?? 0,
      level: userXp?.level ?? 1,
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
    };
  }

  async getBadges(userId: string): Promise<EarnedBadgeResponse[]> {
    const rows = await this.appPrisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });
    return rows.map((row) =>
      earnedBadgeResponseSchema.parse({
        badgeId: row.badgeId,
        name: row.badge.name,
        description: row.badge.description,
        iconUrl: row.badge.iconUrl,
        earnedAt: row.earnedAt.toISOString(),
      }),
    );
  }

  /**
   * The caller's own active missions and current progress. Lazily
   * enrolls the caller into any currently-active `Mission` they don't
   * yet have a `UserMission` row for (§6.3's own real gap found during
   * T2: no separate "mission enrollment" endpoint or scheduled job
   * exists — missions are global, not org-scoped, so self-enrolling a
   * learner into every active mission the first time they either read
   * this endpoint or perform any real activity is this epic's own real,
   * documented MVP mechanism), so a learner with zero activity yet still
   * sees "0 / target" rather than an empty list.
   */
  async getMissions(userId: string): Promise<MissionProgressResponse[]> {
    const activeMissions = await this.activeMissions();
    await this.ensureMissionEnrollment(userId, activeMissions);

    const rows = await this.appPrisma.userMission.findMany({
      where: { userId, missionId: { in: activeMissions.map((mission) => mission.id) } },
      include: { mission: true },
    });
    return rows.map((row) =>
      missionProgressResponseSchema.parse({
        missionId: row.missionId,
        type: row.mission.type,
        metric: row.mission.metric,
        targetValue: row.mission.targetValue,
        progress: row.progress,
        rewardXp: row.mission.rewardXp,
        completedAt: row.completedAt?.toISOString() ?? null,
        endsAt: row.mission.endsAt.toISOString(),
      }),
    );
  }

  private async awardXp(
    userId: string,
    amount: number,
    reason: GamificationXpAwardedPayload['reason'],
  ): Promise<void> {
    const userXp = await this.appPrisma.userXP.upsert({
      where: { userId },
      create: { userId, totalXp: amount, level: computeLevel(amount) },
      update: { totalXp: { increment: amount } },
    });

    const correctLevel = computeLevel(userXp.totalXp);
    if (correctLevel !== userXp.level) {
      await this.appPrisma.userXP.update({ where: { userId }, data: { level: correctLevel } });
    }

    await this.events.publish('gamification.xp.awarded', {
      userId,
      payload: gamificationXpAwardedPayloadSchema.parse({ userId, amount, reason }),
    });
  }

  /**
   * Real, timezone-correct streak update (§3.2/§6.2) — `streak.timezone`
   * is frozen at streak-row creation (from the caller's own `User.timezone`
   * at that moment), never re-synced on later activity (a real, deliberate
   * choice, §10 open question 1: re-syncing mid-streak risks a genuine
   * correctness edge case where a timezone change could retroactively
   * collide or gap "yesterday"/"today" in a way that unfairly breaks or
   * extends an in-progress streak). Always returns the caller's own
   * current streak length, whether or not this call changed it, so T2's
   * mission-progress evaluation has a real value to snapshot every call.
   */
  private async updateStreak(userId: string): Promise<{ currentStreak: number }> {
    const existing = await this.appPrisma.streak.findUnique({ where: { userId } });

    if (!existing) {
      const user = await this.appPrisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      const today = toLocalCalendarDate(new Date(), user.timezone);
      const created = await this.appPrisma.streak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: toDateOnly(today),
          timezone: user.timezone,
        },
      });
      await this.publishStreakUpdated(userId, created.currentStreak);
      return { currentStreak: created.currentStreak };
    }

    const today = toLocalCalendarDate(new Date(), existing.timezone);
    const lastActiveDate = existing.lastActiveDate.toISOString().slice(0, 10);
    const result = computeStreakUpdate(
      existing.currentStreak,
      existing.longestStreak,
      lastActiveDate,
      today,
    );
    if (!result.changed) {
      return { currentStreak: existing.currentStreak };
    }

    await this.appPrisma.streak.update({
      where: { userId },
      data: {
        currentStreak: result.currentStreak,
        longestStreak: result.longestStreak,
        lastActiveDate: toDateOnly(today),
      },
    });
    await this.publishStreakUpdated(userId, result.currentStreak);
    return { currentStreak: result.currentStreak };
  }

  private async publishStreakUpdated(userId: string, streakLength: number): Promise<void> {
    await this.events.publish('gamification.streak.updated', {
      userId,
      payload: gamificationStreakUpdatedPayloadSchema.parse({
        userId,
        streakLength,
        // A real "about to lose your streak" prediction requires a
        // scheduled job inspecting inactive streaks — out of this task's
        // own scope (design doc §10); always `false` here, honestly, not
        // a guessed heuristic.
        atRisk: false,
      }),
    });
  }

  private activeMissions() {
    const now = new Date();
    return this.appPrisma.mission.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    });
  }

  private async ensureMissionEnrollment(
    userId: string,
    activeMissions: Array<{ id: string }>,
  ): Promise<void> {
    if (activeMissions.length === 0) {
      return;
    }
    await this.appPrisma.userMission.createMany({
      data: activeMissions.map((mission) => ({ userId, missionId: mission.id })),
      skipDuplicates: true,
    });
  }

  /**
   * Increments the caller's own progress on every active, not-yet-completed
   * `UserMission` whose `Mission.metric` this activity signal affects.
   * `XP_EARNED`/`LESSONS_COMPLETED` accumulate by the real per-call delta
   * (avoiding a lifetime-counter snapshot, which would let a learner with
   * pre-existing XP/lesson history instantly complete a mission with zero
   * new activity); `STREAK_DAYS` is a state metric, snapshotted as
   * `max(existing progress, current streak)` rather than accumulated.
   * `MINUTES_STUDIED` has no real producing signal anywhere yet (the same
   * gap T1's own §11/R-98 already tracks for the completion signals this
   * epic hasn't wired in) — left untouched, not guessed.
   *
   * A mission's own `rewardXp` on completion is awarded directly via
   * `awardXp()`, not fed back through this same batch — it counts toward
   * other active missions' progress on the *next* real activity signal,
   * not retroactively within this call (a real, documented simplification
   * that avoids re-running this whole batch recursively).
   */
  private async applyMissionProgress(userId: string, signal: ActivitySignal): Promise<void> {
    const activeMissions = await this.activeMissions();
    if (activeMissions.length === 0) {
      return;
    }
    await this.ensureMissionEnrollment(userId, activeMissions);

    const userMissions = await this.appPrisma.userMission.findMany({
      where: {
        userId,
        missionId: { in: activeMissions.map((mission) => mission.id) },
        completedAt: null,
      },
      include: { mission: true },
    });

    for (const userMission of userMissions) {
      const newProgress = this.nextMissionProgress(
        userMission.mission.metric,
        userMission.progress,
        signal,
      );
      if (newProgress === userMission.progress) {
        continue;
      }

      const reachedTarget = newProgress >= userMission.mission.targetValue;
      await this.appPrisma.userMission.update({
        where: { id: userMission.id },
        data: {
          progress: newProgress,
          ...(reachedTarget ? { completedAt: new Date() } : {}),
        },
      });
      if (reachedTarget) {
        await this.awardXp(userId, userMission.mission.rewardXp, 'MISSION_COMPLETED');
      }
    }
  }

  private nextMissionProgress(
    metric: MissionMetric,
    currentProgress: number,
    signal: ActivitySignal,
  ): number {
    switch (metric) {
      case 'XP_EARNED':
        return currentProgress + signal.xpDelta;
      case 'LESSONS_COMPLETED':
        return currentProgress + (signal.lessonCompleted ? 1 : 0);
      case 'STREAK_DAYS':
        return Math.max(currentProgress, signal.currentStreak);
      case 'MINUTES_STUDIED':
        return currentProgress;
    }
  }

  /**
   * Re-checks the caller's own current `totalXp`/`lessonsCompleted`/
   * `currentStreak` against every `Badge.criteria` they haven't already
   * earned. `Badge.criteria` is admin-authored freeform JSON (no schema
   * enforcement, `gamification.prisma`'s own comment) — an unrecognized
   * shape is skipped and logged, not thrown, since one malformed Badge
   * row should never break every other learner's own gamification flow.
   * `UserBadge`'s own `@@unique([userId, badgeId])` plus `createMany`
   * with `skipDuplicates` is the real idempotency guard — safe even if
   * this ever runs concurrently for the same user.
   */
  private async evaluateBadges(userId: string): Promise<void> {
    const [badges, earned, userXp, streak] = await Promise.all([
      this.appPrisma.badge.findMany(),
      this.appPrisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
      this.appPrisma.userXP.findUnique({ where: { userId } }),
      this.appPrisma.streak.findUnique({ where: { userId } }),
    ]);

    const earnedIds = new Set(earned.map((row) => row.badgeId));
    const candidates = badges.filter((badge) => !earnedIds.has(badge.id));
    if (candidates.length === 0) {
      return;
    }

    const totalXp = userXp?.totalXp ?? 0;
    const lessonsCompleted = userXp?.lessonsCompleted ?? 0;
    const currentStreak = streak?.currentStreak ?? 0;

    for (const badge of candidates) {
      const criteria = parseBadgeCriteria(badge.criteria);
      if (!criteria) {
        this.logger.warn(
          { badgeId: badge.id },
          'Badge has an unrecognized criteria shape, skipping evaluation',
        );
        continue;
      }

      const value =
        criteria.type === 'STREAK_DAYS'
          ? currentStreak
          : criteria.type === 'LESSONS_COMPLETED'
            ? lessonsCompleted
            : totalXp;
      if (value < criteria.threshold) {
        continue;
      }

      const result = await this.appPrisma.userBadge.createMany({
        data: [{ userId, badgeId: badge.id }],
        skipDuplicates: true,
      });
      if (result.count > 0) {
        await this.events.publish('gamification.badge.awarded', {
          userId,
          payload: gamificationBadgeAwardedPayloadSchema.parse({ userId, badgeId: badge.id }),
        });
      }
    }
  }
}
