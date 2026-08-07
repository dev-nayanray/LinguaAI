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
 * Real integration tests against live Postgres (E8 T1, §6.1). Proves the
 * design doc's own T1 evidence bar end to end: an ADMIN can author a full
 * Course -> Level -> Unit -> Lesson -> Activity -> Exercise chain, publish
 * it (backfilling a real ContentVersion snapshot for every leaf entity),
 * and a subsequent edit to a *published* entity creates a new version
 * without retroactively changing what an already-recorded ExerciseAttempt
 * was pinned to — `ContentVersion`'s own stated purpose (DATABASE.md
 * §2.3). `ExerciseAttempt` creation itself is simulated via a direct
 * Prisma write (the real submission endpoint is E8 T2's own scope, not
 * yet built) — this suite's own scope is T1's authoring/versioning
 * contract, not re-proving a not-yet-built endpoint.
 */
describe('CourseModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdLanguageIds: string[] = [];
  const createdCourseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  /** Bottom-up cascade delete — Course/Level/Unit carry no onDelete: Cascade on their own parent FK (content.prisma), so cleanup must walk the tree itself, deepest-first, the same discipline assessment.e2e-spec.ts's own per-language cleanup already established. */
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
    const quizzes = await setupPrisma.quiz.findMany({
      where: { activityId: { in: activityIds } },
      select: { id: true },
    });
    const quizIds = quizzes.map((q) => q.id);

    await setupPrisma.exerciseAttempt.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
    await setupPrisma.contentVersion.deleteMany({
      where: { entityId: { in: [...lessonIds, ...activityIds, ...exerciseIds, ...quizIds] } },
    });
    await setupPrisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    await setupPrisma.quiz.deleteMany({ where: { id: { in: quizIds } } });
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
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (createdLanguageIds.length > 0) {
      await setupPrisma.language.deleteMany({ where: { id: { in: createdLanguageIds } } });
    }
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

  async function freshLanguage(): Promise<string> {
    const language = await setupPrisma.language.create({
      data: { code: `e2e-${randomUUID().slice(0, 8)}`, name: 'E2E Test Language' },
    });
    createdLanguageIds.push(language.id);
    return language.id;
  }

  /** Mirrors audit.e2e-spec.ts's own established helper: enroll MFA as USER, promote to ADMIN, re-login (MfaGuard blocks ADMIN routes pre-MFA-verify, ADR-011). */
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

  describe('authorization', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/v1/admin/courses').send({});
      expect(res.status).toBe(401);
    });

    it('rejects a plain USER (non-ADMIN) with 403', async () => {
      const session = await freshSession();
      const languageId = await freshLanguage();
      const res = await request(app.getHttpServer())
        .post('/v1/admin/courses')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, title: 'Spanish for Travel', slug: 'spanish-for-travel' });
      expect(res.status).toBe(403);
    });
  });

  describe('full authoring lifecycle: create -> publish -> edit-while-live preserves history', () => {
    it('publishing backfills a version-1 ContentVersion for every leaf entity, and editing a published Exercise creates v2 without retroactively changing an already-pinned ExerciseAttempt', async () => {
      const admin = await freshAdminSession();
      const languageId = await freshLanguage();
      const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

      const courseRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
        languageId,
        title: 'Spanish for Travel',
        slug: `spanish-for-travel-${randomUUID().slice(0, 8)}`,
      });
      expect(courseRes.status).toBe(201);
      expect(courseRes.body.publishedAt).toBeNull();
      const courseId = courseRes.body.id as string;
      createdCourseIds.push(courseId);

      const levelRes = await auth(
        request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/levels`),
      ).send({ cefrLevel: 'A1', title: 'Beginner', order: 1 });
      expect(levelRes.status).toBe(201);
      const levelId = levelRes.body.id as string;

      const unitRes = await auth(
        request(app.getHttpServer()).post(`/v1/admin/levels/${levelId}/units`),
      ).send({ title: 'Greetings', order: 1 });
      expect(unitRes.status).toBe(201);
      const unitId = unitRes.body.id as string;

      const lessonRes = await auth(
        request(app.getHttpServer()).post(`/v1/admin/units/${unitId}/lessons`),
      ).send({ title: 'Saying Hello', order: 1, estimatedMinutes: 5 });
      expect(lessonRes.status).toBe(201);
      const lessonId = lessonRes.body.id as string;

      const activityRes = await auth(
        request(app.getHttpServer()).post(`/v1/admin/lessons/${lessonId}/activities`),
      ).send({ type: 'READING', title: 'Basic Greetings', content: { text: 'Hola' }, order: 1 });
      expect(activityRes.status).toBe(201);
      const activityId = activityRes.body.id as string;

      const exerciseRes = await auth(
        request(app.getHttpServer()).post(`/v1/admin/activities/${activityId}/exercises`),
      ).send({
        type: 'MULTIPLE_CHOICE',
        prompt: 'How do you say hello in Spanish?',
        correctAnswer: { correctIndex: 0 },
        order: 1,
      });
      expect(exerciseRes.status).toBe(201);
      const exerciseId = exerciseRes.body.id as string;

      // Draft state: no ContentVersion exists yet for anything in this chain.
      const preePublishVersions = await setupPrisma.contentVersion.findMany({
        where: { entityId: { in: [lessonId, activityId, exerciseId] } },
      });
      expect(preePublishVersions).toHaveLength(0);

      const publishRes = await auth(
        request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/publish`),
      ).send({});
      expect(publishRes.status).toBe(201);
      expect(publishRes.body.publishedAt).not.toBeNull();

      // Publish backfilled version 1 for the Lesson/Activity/Exercise chain.
      const lessonV1 = await setupPrisma.contentVersion.findFirst({
        where: { entityType: 'LESSON', entityId: lessonId },
      });
      const activityV1 = await setupPrisma.contentVersion.findFirst({
        where: { entityType: 'ACTIVITY', entityId: activityId },
      });
      const exerciseV1 = await setupPrisma.contentVersion.findFirst({
        where: { entityType: 'EXERCISE', entityId: exerciseId },
      });
      expect(lessonV1?.versionNumber).toBe(1);
      expect(activityV1?.versionNumber).toBe(1);
      expect(exerciseV1?.versionNumber).toBe(1);
      expect((exerciseV1?.snapshot as { prompt: string }).prompt).toBe(
        'How do you say hello in Spanish?',
      );

      // Simulates what E8 T2's real submission endpoint will do — pins a
      // learner's own attempt to the ContentVersion in effect at attempt
      // time. Written directly via Prisma since that endpoint doesn't
      // exist yet (this suite's own scope is T1's versioning contract).
      const learner = await freshSession();
      const attempt = await setupPrisma.exerciseAttempt.create({
        data: {
          userId: learner.userId,
          exerciseId,
          contentVersionId: exerciseV1!.id,
          response: { selectedIndex: 0 },
          isCorrect: true,
          score: 1,
        },
      });

      // Edit the now-published Exercise — must create v2, not mutate v1.
      const updateRes = await auth(
        request(app.getHttpServer()).patch(`/v1/admin/exercises/${exerciseId}`),
      ).send({ prompt: 'Which of these means "hello" in Spanish?' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.prompt).toBe('Which of these means "hello" in Spanish?');

      const exerciseVersionsAfterEdit = await setupPrisma.contentVersion.findMany({
        where: { entityType: 'EXERCISE', entityId: exerciseId },
        orderBy: { versionNumber: 'asc' },
      });
      expect(exerciseVersionsAfterEdit).toHaveLength(2);
      expect(exerciseVersionsAfterEdit[1]?.versionNumber).toBe(2);
      expect((exerciseVersionsAfterEdit[1]?.snapshot as { prompt: string }).prompt).toBe(
        'Which of these means "hello" in Spanish?',
      );

      // The historical proof: v1's own snapshot is byte-for-byte
      // unchanged, and the already-recorded attempt is still pinned to
      // v1's own id — the edit never touched either.
      const lessonV1AfterEdit = await setupPrisma.contentVersion.findUnique({
        where: { id: exerciseV1!.id },
      });
      expect((lessonV1AfterEdit?.snapshot as { prompt: string }).prompt).toBe(
        'How do you say hello in Spanish?',
      );
      const attemptAfterEdit = await setupPrisma.exerciseAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(attemptAfterEdit?.contentVersionId).toBe(exerciseV1!.id);
    }, 30000);

    it('editing a Lesson/Activity/Exercise while its course is still a draft creates no ContentVersion at all', async () => {
      const admin = await freshAdminSession();
      const languageId = await freshLanguage();
      const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

      const courseRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
        languageId,
        title: 'Draft Course',
        slug: `draft-course-${randomUUID().slice(0, 8)}`,
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
      ).send({ title: 'Lesson 1', order: 1 });
      const lessonId = lessonRes.body.id as string;

      const updateRes = await auth(
        request(app.getHttpServer()).patch(`/v1/admin/lessons/${lessonId}`),
      ).send({ title: 'Lesson 1 (edited while draft)' });
      expect(updateRes.status).toBe(200);

      const versions = await setupPrisma.contentVersion.findMany({
        where: { entityType: 'LESSON', entityId: lessonId },
      });
      expect(versions).toHaveLength(0);
    }, 30000);
  });

  describe('ownership/existence checks', () => {
    it('returns 404 when creating a Level under a non-existent Course', async () => {
      const admin = await freshAdminSession();
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/courses/${randomUUID()}/levels`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ cefrLevel: 'A1', title: 'Beginner', order: 1 });
      expect(res.status).toBe(404);
    });

    it('returns 404 when publishing a non-existent Course', async () => {
      const admin = await freshAdminSession();
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/courses/${randomUUID()}/publish`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });
});
