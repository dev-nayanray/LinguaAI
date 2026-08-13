import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import { DomainEventPublisher } from '@linguaai/events';
import { toLocalCalendarDate } from '@linguaai/utils';
import type {
  GamificationStatusResponse,
  GamificationXpAwardedPayload,
} from '@linguaai/validation/gamification';
import {
  gamificationStreakUpdatedPayloadSchema,
  gamificationXpAwardedPayloadSchema,
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

function toDateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

/**
 * `GamificationModule` (E14 T1, design doc §6). `recordActivity()` is the
 * one real entry point — called synchronously, in-process, from
 * `ExerciseAttemptsService`'s own existing event-publishing call sites
 * (ADR-054), never a new async domain-event consumer (avoiding
 * RISK_REGISTER R-89's own already-tracked competing-consumers gap).
 * Every call updates the streak (any real activity counts as "practiced
 * today," independent of whether it earns XP); XP is additionally
 * gated per activity type (§3.3's own anti-farming rule for exercises).
 */
@Injectable()
export class GamificationService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly events: DomainEventPublisher,
  ) {}

  async recordActivity(userId: string, activity: RecordActivityInput): Promise<void> {
    await this.updateStreak(userId);

    if (activity.type === 'EXERCISE_ANSWERED') {
      // Anti-farming (§3.3): XP only on the learner's own first-ever,
      // correct attempt at this specific exercise — a repeat attempt
      // (right or wrong) earns zero XP, closing the most obvious
      // unlimited-re-answer farming vector this schema's own shape
      // invites (ExerciseAttempt has no re-attempt limit).
      if (activity.firstAttempt && activity.correct) {
        await this.awardXp(userId, XP_PER_CORRECT_FIRST_ATTEMPT, 'EXERCISE_ANSWERED');
      }
      return;
    }

    // LESSON_COMPLETED: `ExerciseAttemptsService.maybeEmitLessonCompleted()`
    // is itself only ever invoked once per (userId, lessonId) pair — it
    // only runs on a first-time exercise attempt, and only actually
    // publishes once every attemptable exercise in the lesson has been
    // attempted at least once, a transition that can happen at most once.
    // Confirmed by direct inspection during this task's own implementation,
    // not assumed — no separate idempotency guard is needed here.
    await this.awardXp(userId, XP_PER_LESSON_COMPLETION, 'LESSON_COMPLETED');
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
   * extends an in-progress streak).
   */
  private async updateStreak(userId: string): Promise<void> {
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
      return;
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
      return;
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
}
