import { NotFoundException } from '@nestjs/common';
import type { DomainEventPublisher } from '@linguaai/events';

import { GamificationService } from './gamification.service.js';
import { XP_PER_CORRECT_FIRST_ATTEMPT, XP_PER_LESSON_COMPLETION } from './xp-level.util.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function fakePrisma() {
  return {
    userXP: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    streak: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    badge: { findMany: jest.fn().mockResolvedValue([]) },
    userBadge: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    mission: { findMany: jest.fn().mockResolvedValue([]) },
    userMission: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
    },
  };
}

function fakeEvents(): jest.Mocked<Pick<DomainEventPublisher, 'publish'>> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function fakeLogger() {
  return { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  events: ReturnType<typeof fakeEvents>,
  logger: ReturnType<typeof fakeLogger> = fakeLogger(),
): GamificationService {
  return new GamificationService(
    prisma as never,
    events as unknown as DomainEventPublisher,
    logger as never,
  );
}

describe('GamificationService', () => {
  describe('recordActivity — anti-farming (§3.3)', () => {
    it('awards XP for a first-attempt, correct exercise answer', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 10, level: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userXP.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: { userId: USER_ID, totalXp: XP_PER_CORRECT_FIRST_ATTEMPT, level: 1 },
        update: { totalXp: { increment: XP_PER_CORRECT_FIRST_ATTEMPT } },
      });
      expect(events.publish).toHaveBeenCalledWith('gamification.xp.awarded', {
        userId: USER_ID,
        payload: {
          userId: USER_ID,
          amount: XP_PER_CORRECT_FIRST_ATTEMPT,
          reason: 'EXERCISE_ANSWERED',
        },
      });
    });

    it('awards zero XP for a repeat attempt, even when correct', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: false,
      });

      expect(prisma.userXP.upsert).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalledWith('gamification.xp.awarded', expect.anything());
    });

    it('awards zero XP for a first attempt that is wrong', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: false,
        firstAttempt: true,
      });

      expect(prisma.userXP.upsert).not.toHaveBeenCalled();
    });

    it('always updates the streak, regardless of whether XP was awarded (a repeat attempt still counts as real activity today)', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 3,
        longestStreak: 3,
        lastActiveDate: new Date('2026-08-12T00:00:00.000Z'),
        timezone: 'UTC',
      });
      const events = fakeEvents();
      const service = buildService(prisma, events);
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: false,
        firstAttempt: false,
      });

      expect(prisma.streak.update).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: {
          currentStreak: 4,
          longestStreak: 4,
          lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        },
      });
      jest.useRealTimers();
    });
  });

  describe('recordActivity — LESSON_COMPLETED', () => {
    it('awards the lesson-completion XP bonus', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 50, level: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, { type: 'LESSON_COMPLETED' });

      expect(prisma.userXP.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: { userId: USER_ID, totalXp: XP_PER_LESSON_COMPLETION, level: 1 },
        update: { totalXp: { increment: XP_PER_LESSON_COMPLETION } },
      });
      expect(events.publish).toHaveBeenCalledWith('gamification.xp.awarded', {
        userId: USER_ID,
        payload: { userId: USER_ID, amount: XP_PER_LESSON_COMPLETION, reason: 'LESSON_COMPLETED' },
      });
    });
  });

  describe('awardXp — level recomputation', () => {
    it('bumps the level when totalXp crosses a level boundary', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      // Upsert's own return value already reflects the post-increment totalXp (100) but a stale level (1).
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 100, level: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, { type: 'LESSON_COMPLETED' });

      expect(prisma.userXP.update).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: { level: 2 },
      });
    });

    it('does not issue a redundant level update when the level is already correct', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 60, level: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, { type: 'LESSON_COMPLETED' });

      expect(prisma.userXP.update).not.toHaveBeenCalled();
    });
  });

  describe('streak creation (first-ever activity)', () => {
    it('creates a real Streak row seeded from the user own timezone when none exists yet', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ timezone: 'Asia/Kolkata' });
      prisma.streak.create.mockResolvedValue({ currentStreak: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: false,
        firstAttempt: true,
      });

      expect(prisma.streak.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            currentStreak: 1,
            longestStreak: 1,
            timezone: 'Asia/Kolkata',
          }) as unknown,
        }),
      );
      expect(events.publish).toHaveBeenCalledWith('gamification.streak.updated', {
        userId: USER_ID,
        payload: { userId: USER_ID, streakLength: 1, atRisk: false },
      });
    });

    it('throws 404 (not a silent failure) when the user does not exist', async () => {
      const prisma = fakePrisma();
      prisma.streak.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await expect(
        service.recordActivity(USER_ID, {
          type: 'EXERCISE_ANSWERED',
          correct: true,
          firstAttempt: true,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.userXP.upsert).not.toHaveBeenCalled();
    });
  });

  describe('streak no-op (already active today)', () => {
    it('never calls streak.update, and never publishes gamification.streak.updated, when already active today', async () => {
      const prisma = fakePrisma();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 5,
        longestStreak: 5,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 10, level: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.streak.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalledWith(
        'gamification.streak.updated',
        expect.anything(),
      );
      jest.useRealTimers();
    });
  });

  describe('getStatus', () => {
    it("returns the caller's own real XP/level/streak", async () => {
      const prisma = fakePrisma();
      prisma.userXP.findUnique.mockResolvedValue({ userId: USER_ID, totalXp: 120, level: 2 });
      prisma.streak.findUnique.mockResolvedValue({
        userId: USER_ID,
        currentStreak: 7,
        longestStreak: 12,
      });
      const service = buildService(prisma, fakeEvents());

      const result = await service.getStatus(USER_ID);

      expect(result).toEqual({ totalXp: 120, level: 2, currentStreak: 7, longestStreak: 12 });
    });

    it('defaults to zero XP/level 1/no streak for a learner with no activity yet', async () => {
      const prisma = fakePrisma();
      prisma.userXP.findUnique.mockResolvedValue(null);
      prisma.streak.findUnique.mockResolvedValue(null);
      const service = buildService(prisma, fakeEvents());

      const result = await service.getStatus(USER_ID);

      expect(result).toEqual({ totalXp: 0, level: 1, currentStreak: 0, longestStreak: 0 });
    });
  });

  describe('recordActivity — badge evaluation (§6.3, T2)', () => {
    function baseActivitySetup(prisma: ReturnType<typeof fakePrisma>) {
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 7,
        longestStreak: 7,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 10, level: 1 });
    }

    it('awards a real, not-yet-earned Badge whose criteria is now met, and publishes gamification.badge.awarded', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.badge.findMany.mockResolvedValue([
        {
          id: '33333333-3333-3333-3333-333333333333',
          name: '7-Day Streak',
          criteria: { type: 'STREAK_DAYS', threshold: 7 },
        },
      ]);
      prisma.userBadge.findMany.mockResolvedValue([]);
      prisma.userBadge.createMany.mockResolvedValue({ count: 1 });
      prisma.userXP.findUnique.mockResolvedValue({ userId: USER_ID, totalXp: 10, level: 1 });
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userBadge.createMany).toHaveBeenCalledWith({
        data: [{ userId: USER_ID, badgeId: '33333333-3333-3333-3333-333333333333' }],
        skipDuplicates: true,
      });
      expect(events.publish).toHaveBeenCalledWith('gamification.badge.awarded', {
        userId: USER_ID,
        payload: { userId: USER_ID, badgeId: '33333333-3333-3333-3333-333333333333' },
      });
    });

    it('never re-evaluates a Badge the caller already earned', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.badge.findMany.mockResolvedValue([
        {
          id: '33333333-3333-3333-3333-333333333333',
          name: '7-Day Streak',
          criteria: { type: 'STREAK_DAYS', threshold: 7 },
        },
      ]);
      prisma.userBadge.findMany.mockResolvedValue([
        { badgeId: '33333333-3333-3333-3333-333333333333' },
      ]);
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userBadge.createMany).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalledWith(
        'gamification.badge.awarded',
        expect.anything(),
      );
    });

    it("does not award a Badge whose criteria isn't met yet", async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.badge.findMany.mockResolvedValue([
        {
          id: '33333333-3333-3333-3333-333333333333',
          name: '30-Day Streak',
          criteria: { type: 'STREAK_DAYS', threshold: 30 },
        },
      ]);
      prisma.userBadge.findMany.mockResolvedValue([]);
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userBadge.createMany).not.toHaveBeenCalled();
    });

    it('skips (and logs, not throws) a Badge with an unrecognized criteria shape rather than breaking evaluation for every other Badge', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.badge.findMany.mockResolvedValue([
        { id: '22222222-2222-2222-2222-222222222222', name: 'Malformed', criteria: { foo: 'bar' } },
        {
          id: '33333333-3333-3333-3333-333333333333',
          name: '7-Day Streak',
          criteria: { type: 'STREAK_DAYS', threshold: 7 },
        },
      ]);
      prisma.userBadge.findMany.mockResolvedValue([]);
      prisma.userBadge.createMany.mockResolvedValue({ count: 1 });
      const events = fakeEvents();
      const logger = fakeLogger();
      const service = buildService(prisma, events, logger);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(logger.warn).toHaveBeenCalledWith(
        { badgeId: '22222222-2222-2222-2222-222222222222' },
        expect.stringContaining('unrecognized criteria shape'),
      );
      expect(prisma.userBadge.createMany).toHaveBeenCalledWith({
        data: [{ userId: USER_ID, badgeId: '33333333-3333-3333-3333-333333333333' }],
        skipDuplicates: true,
      });
    });
  });

  describe('recordActivity — mission progress (§6.3, T2)', () => {
    function baseActivitySetup(prisma: ReturnType<typeof fakePrisma>) {
      prisma.streak.findUnique.mockResolvedValue({
        currentStreak: 3,
        longestStreak: 3,
        lastActiveDate: new Date('2026-08-13T00:00:00.000Z'),
        timezone: 'UTC',
      });
      prisma.userXP.upsert.mockResolvedValue({ userId: USER_ID, totalXp: 10, level: 1 });
    }

    it('lazily enrolls the caller into every currently-active Mission they have no UserMission row for yet', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          metric: 'XP_EARNED',
          targetValue: 100,
          rewardXp: 50,
        },
      ]);
      prisma.userMission.findMany.mockResolvedValue([]);
      const service = buildService(prisma, fakeEvents());

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userMission.createMany).toHaveBeenCalledWith({
        data: [{ userId: USER_ID, missionId: '44444444-4444-4444-4444-444444444444' }],
        skipDuplicates: true,
      });
    });

    it('increments XP_EARNED mission progress by the real XP awarded this call, not a lifetime snapshot', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          metric: 'XP_EARNED',
          targetValue: 100,
          rewardXp: 50,
        },
      ]);
      prisma.userMission.findMany.mockResolvedValue([
        {
          id: 'um-1',
          progress: 20,
          completedAt: null,
          mission: {
            id: '44444444-4444-4444-4444-444444444444',
            metric: 'XP_EARNED',
            targetValue: 100,
            rewardXp: 50,
          },
        },
      ]);
      const service = buildService(prisma, fakeEvents());

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userMission.update).toHaveBeenCalledWith({
        where: { id: 'um-1' },
        data: { progress: 30 },
      });
    });

    it('marks completedAt and awards Mission.rewardXp the moment targetValue is reached, exactly once', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          metric: 'XP_EARNED',
          targetValue: 30,
          rewardXp: 200,
        },
      ]);
      prisma.userMission.findMany.mockResolvedValue([
        {
          id: 'um-1',
          progress: 20,
          completedAt: null,
          mission: {
            id: '44444444-4444-4444-4444-444444444444',
            metric: 'XP_EARNED',
            targetValue: 30,
            rewardXp: 200,
          },
        },
      ]);
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userMission.update).toHaveBeenCalledWith({
        where: { id: 'um-1' },
        data: { progress: 30, completedAt: expect.any(Date) as Date },
      });
      expect(events.publish).toHaveBeenCalledWith('gamification.xp.awarded', {
        userId: USER_ID,
        payload: { userId: USER_ID, amount: 200, reason: 'MISSION_COMPLETED' },
      });
    });

    it('never re-processes a UserMission that already has completedAt set', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          metric: 'XP_EARNED',
          targetValue: 30,
          rewardXp: 200,
        },
      ]);
      // completedAt: null is the query filter itself (completedAt: null in
      // the findMany where clause) -- an already-completed UserMission is
      // never even returned, so it never reaches the update/award path.
      prisma.userMission.findMany.mockResolvedValue([]);
      const events = fakeEvents();
      const service = buildService(prisma, events);

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userMission.update).not.toHaveBeenCalled();
    });

    it('snapshots STREAK_DAYS progress as max(existing progress, current streak) rather than accumulating', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          metric: 'STREAK_DAYS',
          targetValue: 7,
          rewardXp: 100,
        },
      ]);
      prisma.userMission.findMany.mockResolvedValue([
        {
          id: 'um-1',
          progress: 1,
          completedAt: null,
          mission: {
            id: '44444444-4444-4444-4444-444444444444',
            metric: 'STREAK_DAYS',
            targetValue: 7,
            rewardXp: 100,
          },
        },
      ]);
      const service = buildService(prisma, fakeEvents());

      // baseActivitySetup's own currentStreak is 3 -- higher than this
      // UserMission's existing progress (1), so the snapshot should raise
      // it to 3, not accumulate to 1+3=4.
      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: false,
        firstAttempt: true,
      });

      expect(prisma.userMission.update).toHaveBeenCalledWith({
        where: { id: 'um-1' },
        data: { progress: 3 },
      });
    });

    it('never touches MINUTES_STUDIED progress -- no real producing signal exists yet', async () => {
      const prisma = fakePrisma();
      baseActivitySetup(prisma);
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          metric: 'MINUTES_STUDIED',
          targetValue: 15,
          rewardXp: 50,
        },
      ]);
      prisma.userMission.findMany.mockResolvedValue([
        {
          id: 'um-1',
          progress: 0,
          completedAt: null,
          mission: {
            id: '44444444-4444-4444-4444-444444444444',
            metric: 'MINUTES_STUDIED',
            targetValue: 15,
            rewardXp: 50,
          },
        },
      ]);
      const service = buildService(prisma, fakeEvents());

      await service.recordActivity(USER_ID, {
        type: 'EXERCISE_ANSWERED',
        correct: true,
        firstAttempt: true,
      });

      expect(prisma.userMission.update).not.toHaveBeenCalled();
    });
  });

  describe('getBadges', () => {
    it("returns the caller's own earned badges, most recent first", async () => {
      const prisma = fakePrisma();
      const earnedAt = new Date('2026-08-10T00:00:00.000Z');
      prisma.userBadge.findMany.mockResolvedValue([
        {
          badgeId: '33333333-3333-3333-3333-333333333333',
          earnedAt,
          badge: { name: '7-Day Streak', description: 'desc', iconUrl: null },
        },
      ]);
      const service = buildService(prisma, fakeEvents());

      const result = await service.getBadges(USER_ID);

      expect(result).toEqual([
        {
          badgeId: '33333333-3333-3333-3333-333333333333',
          name: '7-Day Streak',
          description: 'desc',
          iconUrl: null,
          earnedAt: earnedAt.toISOString(),
        },
      ]);
    });
  });

  describe('getMissions', () => {
    it('lazily enrolls the caller into active missions before reading, so a learner with no activity yet still sees 0-progress rows', async () => {
      const prisma = fakePrisma();
      const endsAt = new Date('2026-08-20T00:00:00.000Z');
      prisma.mission.findMany.mockResolvedValue([
        {
          id: '44444444-4444-4444-4444-444444444444',
          type: 'WEEKLY',
          metric: 'LESSONS_COMPLETED',
          targetValue: 5,
          rewardXp: 200,
          endsAt,
        },
      ]);
      prisma.userMission.findMany.mockResolvedValue([
        {
          missionId: '44444444-4444-4444-4444-444444444444',
          progress: 0,
          completedAt: null,
          mission: {
            type: 'WEEKLY',
            metric: 'LESSONS_COMPLETED',
            targetValue: 5,
            rewardXp: 200,
            endsAt,
          },
        },
      ]);
      const service = buildService(prisma, fakeEvents());

      const result = await service.getMissions(USER_ID);

      expect(prisma.userMission.createMany).toHaveBeenCalledWith({
        data: [{ userId: USER_ID, missionId: '44444444-4444-4444-4444-444444444444' }],
        skipDuplicates: true,
      });
      expect(result).toEqual([
        {
          missionId: '44444444-4444-4444-4444-444444444444',
          type: 'WEEKLY',
          metric: 'LESSONS_COMPLETED',
          targetValue: 5,
          progress: 0,
          rewardXp: 200,
          completedAt: null,
          endsAt: endsAt.toISOString(),
        },
      ]);
    });
  });
});
