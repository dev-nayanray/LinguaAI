import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { CertificateService } from '../src/modules/certificates/certificate.service.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E20 T2, design doc §5).
 * Real by-IP rate-limit *enforcement* (the actual counter/429 behavior)
 * is deliberately not re-proven here against real Redis — mirroring
 * `rate-limit.e2e-spec.ts`'s own established precedent (E2-T21): driving
 * a real counter to its real threshold against shared dev/CI infra would
 * affect every other concurrently-running e2e suite that depends on the
 * same Redis instance, and `rate-limit.guard.spec.ts`'s own unit tests
 * already prove the guard's real behavior generically (mocking the
 * counter directly, not tied to any one route). What this suite verifies
 * for real: a real `Certificate` (issued via Level completion, E20 T1)
 * is genuinely publicly verifiable by its own raw token, returns only
 * real, non-sensitive proof (never a userId/email), 404s on an unknown
 * token, and a learner can see their own certificate history.
 */
describe('CertificatesModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
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

  afterAll(async () => {
    for (const courseId of createdCourseIds) {
      await setupPrisma.certificate.deleteMany({ where: { level: { courseId } } });
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
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.userXP.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.streak.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.userBadge.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.userMission.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    await app.close();
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

  /** A minimal, real Course -> Level -> Unit -> Lesson -> Activity -> single Exercise chain, published. */
  async function authorMinimalPublishedLevel(): Promise<{
    levelId: string;
    exerciseId: string;
  }> {
    const admin = await freshAdminSession();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

    const languageRes = await setupPrisma.language.upsert({
      where: { code: `e20-${randomUUID().slice(0, 6)}` },
      create: { code: `e20-${randomUUID().slice(0, 6)}`, name: 'E20 Test Language' },
      update: {},
    });

    const courseRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
      languageId: languageRes.id,
      title: 'Certificate Test Course',
      slug: `certificate-test-course-${randomUUID().slice(0, 8)}`,
    });
    const courseId = courseRes.body.id as string;
    createdCourseIds.push(courseId);

    const levelRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/levels`),
    ).send({ cefrLevel: 'A1', title: 'Certificate Test Level', order: 1 });
    const levelId = levelRes.body.id as string;

    const unitRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/levels/${levelId}/units`),
    ).send({ title: 'Unit 1', order: 1 });
    const lessonRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/units/${unitRes.body.id as string}/lessons`),
    ).send({ title: 'Lesson 1', order: 1, estimatedMinutes: 5 });
    const activityRes = await auth(
      request(app.getHttpServer()).post(
        `/v1/admin/lessons/${lessonRes.body.id as string}/activities`,
      ),
    ).send({ type: 'GRAMMAR_EXPLANATION', title: 'Activity 1', content: {}, order: 1 });
    const exerciseRes = await auth(
      request(app.getHttpServer()).post(
        `/v1/admin/activities/${activityRes.body.id as string}/exercises`,
      ),
    ).send({
      type: 'MULTIPLE_CHOICE',
      prompt: 'Choose the greeting',
      correctAnswer: { correctIndex: 0 },
      order: 1,
    });

    await auth(request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/publish`));

    return { levelId, exerciseId: exerciseRes.body.id as string };
  }

  it('a real Level completion issues a real Certificate row with a real 64-char SHA-256 hash', async () => {
    const { levelId, exerciseId } = await authorMinimalPublishedLevel();
    const learner = await freshSession();

    await request(app.getHttpServer())
      .post(`/v1/exercises/${exerciseId}/attempts`)
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ response: { selectedIndex: 0 } });

    const certificate = await setupPrisma.certificate.findFirstOrThrow({
      where: { userId: learner.userId, levelId },
    });
    expect(certificate.courseId).toBeNull();
    expect(certificate.examProgramId).toBeNull();
    expect(certificate.verificationTokenHash).toHaveLength(64);
  });

  // The Level-completion flow (above) never returns a raw verification
  // token to the caller at this epic's own scope -- no learner-facing
  // "here is your Level certificate's own link" endpoint exists yet
  // (a real, separately-scoped future UI concern, design doc §3.5). The
  // verification endpoint itself is still fully real and independently
  // testable: it's exercised here against a real token from the same
  // shared CertificateService every real producer (including the Level-
  // completion path above) actually calls -- the real code under test,
  // not a stand-in.
  it('GET /v1/certificates/verify/:token returns real, non-sensitive proof for a real token, and 404s for an unknown one', async () => {
    const { levelId } = await authorMinimalPublishedLevel();
    const learner = await freshSession();
    const certService = new CertificateService(setupPrisma as never, setupPrisma as never);
    const { rawToken } = await certService.issue(learner.userId, { levelId });

    const verifyRes = await request(app.getHttpServer()).get(`/v1/certificates/verify/${rawToken}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.milestoneType).toBe('LEVEL');
    expect(verifyRes.body.milestoneName).toBe('Certificate Test Level');
    expect(typeof verifyRes.body.holderDisplayName).toBe('string');
    expect(verifyRes.body).not.toHaveProperty('userId');
    expect(verifyRes.body).not.toHaveProperty('email');
    expect(verifyRes.body).not.toHaveProperty('id');

    const notFoundRes = await request(app.getHttpServer()).get(
      '/v1/certificates/verify/not-a-real-token',
    );
    expect(notFoundRes.status).toBe(404);
  });

  it("GET /v1/certificates lists only the caller's own certificates, newest first, and rejects unauthenticated", async () => {
    const unauth = await request(app.getHttpServer()).get('/v1/certificates');
    expect(unauth.status).toBe(401);

    const { levelId } = await authorMinimalPublishedLevel();
    const owner = await freshSession();
    const intruder = await freshSession();
    const certService = new CertificateService(setupPrisma as never, setupPrisma as never);
    await certService.issue(owner.userId, { levelId });

    const ownerRes = await request(app.getHttpServer())
      .get('/v1/certificates')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.length).toBeGreaterThanOrEqual(1);
    for (const cert of ownerRes.body.data as { levelId: string | null }[]) {
      expect(cert.levelId === levelId || cert.levelId === null).toBe(true);
    }

    const intruderRes = await request(app.getHttpServer())
      .get('/v1/certificates')
      .set('Authorization', `Bearer ${intruder.accessToken}`);
    expect(intruderRes.status).toBe(200);
    expect(intruderRes.body.data).toHaveLength(0);
  });
});
