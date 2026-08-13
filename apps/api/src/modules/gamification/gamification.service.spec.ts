import { NotFoundException } from '@nestjs/common';
import type { DomainEventPublisher } from '@linguaai/events';

import { GamificationService } from './gamification.service.js';
import { XP_PER_CORRECT_FIRST_ATTEMPT, XP_PER_LESSON_COMPLETION } from './xp-level.util.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function fakePrisma() {
  return {
    userXP: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    streak: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
  };
}

function fakeEvents(): jest.Mocked<Pick<DomainEventPublisher, 'publish'>> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  events: ReturnType<typeof fakeEvents>,
): GamificationService {
  return new GamificationService(prisma as never, events as unknown as DomainEventPublisher);
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
});
