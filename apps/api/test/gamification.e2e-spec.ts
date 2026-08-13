import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E14 T1, design doc §6/§9).
 * This suite's own evidence bar: XP is really awarded once (not twice)
 * across a re-attempted exercise (§3.3's own anti-farming rule), and a
 * real streak increments/resets correctly across distinct local calendar
 * days (§3.2/§6.2's own grace-window policy) — proven by backdating a
 * real `Streak.lastActiveDate` row directly (the same "seed/mutate real
 * DB state to simulate elapsed time" technique this platform's own
 * timezone-correctness tests already use, since faking process-wide system
 * time in a real e2e HTTP test is neither practical nor what's actually
 * being verified here — the real calendar-date diff against real stored
 * data is).
 */
describe('GamificationController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdCourseIds: string[] = [];
  const createdBadgeIds: string[] = [];
  const createdMissionIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  async function cleanupCourse(courseId: string): Promise<void> {
    const lessons = await setupPrisma.lesson.findMany({
      where: { unit: { level: { courseId } } },
      select: { id: true },
    });
    const lessonIds = lessons.map((l) => l.id);
    const activities = await setupPrisma.activity.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true },
    });
    const activityIds = activities.map((a) => a.id);
    const exercises = await setupPrisma.exercise.findMany({
      where: { activityId: { in: activityIds } },
      select: { id: true },
    });
    const exerciseIds = exercises.map((e) => e.id);
    await setupPrisma.exerciseAttempt.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
    await setupPrisma.contentVersion.deleteMany({
      where: { entityId: { in: [...lessonIds, ...activityIds, ...exerciseIds] } },
    });
    await setupPrisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    await setupPrisma.activity.deleteMany({ where: { id: { in: activityIds } } });
    await setupPrisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    await setupPrisma.unit.deleteMany({ where: { level: { courseId } } });
    await setupPrisma.level.deleteMany({ where: { courseId } });
    await setupPrisma.course.delete({ where: { id: courseId } });
  }

  afterAll(async () => {
    for (const courseId of createdCourseIds) {
      await cleanupCourse(courseId);
    }
    // Scoped by badgeId/missionId as well as userId -- this suite's own
    // custom Badge/Mission rows are globally visible (not org/user-scoped
    // tables), so a learner created by a *different*, concurrently-running
    // e2e spec file can genuinely earn/enroll into them too (e.g. any
    // learner anywhere completing their first lesson while this suite's
    // own `LESSONS_COMPLETED threshold:1` Badge exists). Cleaning up only
    // by `createdUserIds` left those cross-file UserBadge/UserMission rows
    // behind, which then blocked the Badge/Mission delete below with a
    // real foreign-key violation under full-suite concurrent load -- a
    // real bug found and fixed during this task's own verification, not
    // a flaky test.
    await setupPrisma.userBadge.deleteMany({
      where: { OR: [{ userId: { in: createdUserIds } }, { badgeId: { in: createdBadgeIds } }] },
    });
    await setupPrisma.userMission.deleteMany({
      where: {
        OR: [{ userId: { in: createdUserIds } }, { missionId: { in: createdMissionIds } }],
      },
    });
    if (createdBadgeIds.length > 0) {
      await setupPrisma.badge.deleteMany({ where: { id: { in: createdBadgeIds } } });
    }
    if (createdMissionIds.length > 0) {
      await setupPrisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } });
    }
    await setupPrisma.userXP.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.streak.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    if (app) {
      await app.close();
    }
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  async function completeMfaEnrollment(session: RegisteredSession): Promise<string> {
    const enrollRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .set('Authorization', `Bearer ${session.accessToken}`);
    const secret = enrollRes.body.secret as string;
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ secret, code: authenticator.generate(secret) });
    return secret;
  }

  async function freshAdminSession(): Promise<RegisteredSession> {
    const session = await freshSession();
    const secret = await completeMfaEnrollment(session);
    await setupPrisma.user.update({ where: { id: session.userId }, data: { role: 'ADMIN' } });
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: session.email, password: TEST_PASSWORD });
    const challengeRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/challenge')
      .send({ challengeToken: loginRes.body.challengeToken, code: authenticator.generate(secret) });
    return { ...session, accessToken: challengeRes.body.accessToken as string };
  }

  /** Authors and publishes a course with `exerciseCount` MULTIPLE_CHOICE exercises in one lesson, returning their real ids. */
  async function publishedLessonWithExercises(exerciseCount: number): Promise<string[]> {
    const admin = await freshAdminSession();
    const language = await setupPrisma.language.create({
      data: { code: `e2e-${randomUUID().slice(0, 8)}`, name: 'E2E Test Language' },
    });
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

    const courseRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
      languageId: language.id,
      title: 'Gamification Test Course',
      slug: `gamification-test-${randomUUID().slice(0, 8)}`,
    });
    const courseId = courseRes.body.id as string;
    createdCourseIds.push(courseId);
    const levelRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/levels`),
    ).send({ cefrLevel: 'A1', title: 'Beginner', order: 1 });
    const unitRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/levels/${levelRes.body.id as string}/units`),
    ).send({ title: 'Unit 1', order: 1 });
    const lessonRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/units/${unitRes.body.id as string}/lessons`),
    ).send({ title: 'Lesson 1', order: 1, estimatedMinutes: 5 });
    const activityRes = await auth(
      request(app.getHttpServer()).post(
        `/v1/admin/lessons/${lessonRes.body.id as string}/activities`,
      ),
    ).send({
      type: 'READING',
      title: 'Activity 1',
      content: { passage: 'Hola', cefrLevel: 'A1' },
      order: 1,
    });

    const exerciseIds: string[] = [];
    for (let i = 0; i < exerciseCount; i++) {
      const exerciseRes = await auth(
        request(app.getHttpServer()).post(
          `/v1/admin/activities/${activityRes.body.id as string}/exercises`,
        ),
      ).send({
        type: 'MULTIPLE_CHOICE',
        prompt: `Question ${i + 1}`,
        correctAnswer: { correctIndex: 0 },
        order: i + 1,
      });
      exerciseIds.push(exerciseRes.body.id as string);
    }

    await auth(request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/publish`)).send({});
    return exerciseIds;
  }

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/gamification/me');
    expect(res.status).toBe(401);
  });

  it('returns zero XP/level 1/no streak for a learner with no activity yet', async () => {
    const session = await freshSession();

    const res = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalXp: 0, level: 1, currentStreak: 0, longestStreak: 0 });
  });

  it("awards XP once for a correct first attempt, and never again for a repeat attempt at the same exercise (§3.3's own anti-farming rule)", async () => {
    // Two exercises, only the first is ever attempted -- isolates
    // exercise-answer XP from the separate lesson-completion bonus
    // (which only fires once every exercise in the lesson is attempted).
    const [exerciseId] = await publishedLessonWithExercises(2);
    const learner = await freshSession();

    const first = await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    expect(first.status).toBe(201);

    const statusAfterFirst = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(statusAfterFirst.body.totalXp).toBe(10);
    expect(statusAfterFirst.body.currentStreak).toBe(1);

    // A repeat attempt at the same exercise -- earns no additional XP.
    const second = await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    expect(second.status).toBe(201);

    const statusAfterSecond = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(statusAfterSecond.body.totalXp).toBe(10);
  });

  it('awards a lesson-completion XP bonus once every exercise in the lesson has been attempted', async () => {
    const exerciseIds = await publishedLessonWithExercises(2);
    const learner = await freshSession();

    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseIds[0]}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    const midway = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(midway.body.totalXp).toBe(10); // exercise XP only, lesson not yet complete

    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseIds[1]}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    const afterCompletion = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(afterCompletion.body.totalXp).toBe(70); // 10 + 10 exercise XP + 50 lesson-completion bonus
  });

  it("increments the streak on a real, genuinely-elapsed consecutive local calendar day, and resets it after a real gap (§3.2's own grace-window policy)", async () => {
    const [exerciseId] = await publishedLessonWithExercises(1);
    const learner = await freshSession();

    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    const day1 = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(day1.body.currentStreak).toBe(1);

    // Simulate a real elapsed day by backdating the real, persisted
    // Streak.lastActiveDate row directly -- the streak logic itself reads
    // real stored data, not a faked system clock.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await setupPrisma.streak.update({
      where: { userId: learner.userId },
      data: { lastActiveDate: yesterday },
    });

    const [exerciseId2] = await publishedLessonWithExercises(1);
    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId2}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    const day2 = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(day2.body.currentStreak).toBe(2);
    expect(day2.body.longestStreak).toBe(2);

    // Simulate a real skipped day (a genuine gap, not consecutive) -- the
    // streak must reset to 1, never silently stay elevated.
    const threeDaysAgo = new Date();
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    await setupPrisma.streak.update({
      where: { userId: learner.userId },
      data: { lastActiveDate: threeDaysAgo },
    });

    const [exerciseId3] = await publishedLessonWithExercises(1);
    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId3}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });
    const day3 = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(day3.body.currentStreak).toBe(1);
    expect(day3.body.longestStreak).toBe(2); // longestStreak never regresses
  });

  it('awards a real, seeded Badge once its criteria is met, and never again (§6.3, T2)', async () => {
    const badge = await setupPrisma.badge.create({
      data: {
        name: `E2E First Lesson (${randomUUID().slice(0, 8)})`,
        description: 'Completed your first lesson.',
        criteria: { type: 'LESSONS_COMPLETED', threshold: 1 },
      },
    });
    createdBadgeIds.push(badge.id);

    const [exerciseId] = await publishedLessonWithExercises(1);
    const learner = await freshSession();

    // Filtered to this test's own Badge id throughout -- a real,
    // separately-seeded "First Lesson Complete" Badge with the identical
    // LESSONS_COMPLETED/threshold:1 criteria already exists from
    // `seed.ts`'s own `seedBadgesAndMissions()`, and would legitimately
    // also be earned by the same first-lesson-completion activity this
    // test performs, so asserting the whole response array's length would
    // be wrong.
    const ownBadges = (body: Array<{ badgeId: string }>): Array<{ badgeId: string }> =>
      body.filter((row) => row.badgeId === badge.id);

    const before = await request(app.getHttpServer())
      .get('/v1/gamification/badges')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(ownBadges(before.body as Array<{ badgeId: string }>)).toHaveLength(0);

    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });

    const after = await request(app.getHttpServer())
      .get('/v1/gamification/badges')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    const afterOwn = ownBadges(after.body as Array<{ badgeId: string; name: string }>);
    expect(afterOwn).toHaveLength(1);
    expect(afterOwn[0]).toMatchObject({ badgeId: badge.id, name: badge.name });

    // A second, unrelated lesson completion must never award the same
    // Badge twice -- UserBadge's own @@unique([userId, badgeId]) plus
    // this service's own createMany({ skipDuplicates: true }) is the
    // real idempotency guard being proven here.
    const [exerciseId2] = await publishedLessonWithExercises(1);
    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId2}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });

    const stillOnlyOne = await request(app.getHttpServer())
      .get('/v1/gamification/badges')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(ownBadges(stillOnlyOne.body as Array<{ badgeId: string }>)).toHaveLength(1);
  });

  it('tracks real mission progress, self-enrolling on first read, and awards the mission bonus exactly once the target is reached (§6.3, T2)', async () => {
    const now = new Date();
    const mission = await setupPrisma.mission.create({
      data: {
        type: 'DAILY',
        metric: 'XP_EARNED',
        targetValue: 10, // exactly one correct first-attempt exercise's own XP
        rewardXp: 25,
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    createdMissionIds.push(mission.id);

    // Two exercises, only the first is ever attempted -- the same
    // isolation the anti-farming test above uses, so this exercise
    // attempt's own XP delta doesn't also co-fire the separate
    // lesson-completion bonus (which would add its own 50 XP and,
    // depending on ordering, its own further mission-progress delta,
    // making the assertion below ambiguous about which signal actually
    // drove the mission to completion).
    const [exerciseId] = await publishedLessonWithExercises(2);
    const learner = await freshSession();

    // Lazily enrolled on first read, before any real activity -- 0 progress.
    const beforeActivity = await request(app.getHttpServer())
      .get('/v1/gamification/missions')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    const missionRow = (
      beforeActivity.body as Array<{ missionId: string; progress: number; completedAt: null }>
    ).find((row) => row.missionId === mission.id);
    expect(missionRow).toMatchObject({ progress: 0, completedAt: null });

    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });

    const afterActivity = await request(app.getHttpServer())
      .get('/v1/gamification/missions')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    const completedRow = (
      afterActivity.body as Array<{
        missionId: string;
        progress: number;
        completedAt: string | null;
      }>
    ).find((row) => row.missionId === mission.id);
    expect(completedRow?.progress).toBe(10);
    expect(completedRow?.completedAt).not.toBeNull();

    // The mission's own rewardXp (25) is a real additional XP award on top
    // of the exercise's own 10 XP -- 10 + 25 = 35.
    const status = await request(app.getHttpServer())
      .get('/v1/gamification/me')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(status.body.totalXp).toBe(35);
  });
});
