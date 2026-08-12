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
 * Real integration tests against live Postgres (E12 T2, design doc §6.3).
 * `ProficiencyLevel` has no write-side endpoint reachable from here (its
 * only writer is `AssessmentService.completeAttempt`, a full assessment
 * flow genuinely out of this test's own scope) — seeded directly via
 * `setupPrisma`, the same "seed the fixture directly when no endpoint
 * exists for it" discipline `pronunciation-lab.e2e-spec.ts`'s own
 * `language.findUniqueOrThrow` fixture lookup already established.
 */
describe('CourseCatalogController — matched Reading activities (e2e)', () => {
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
    await setupPrisma.contentVersion.deleteMany({
      where: { entityId: { in: [...lessonIds, ...activities.map((a) => a.id)] } },
    });
    await setupPrisma.activity.deleteMany({ where: { lessonId: { in: lessonIds } } });
    await setupPrisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    await setupPrisma.unit.deleteMany({ where: { level: { courseId } } });
    await setupPrisma.level.deleteMany({ where: { courseId } });
    await setupPrisma.course.delete({ where: { id: courseId } });
  }

  afterAll(async () => {
    for (const courseId of createdCourseIds) {
      await cleanupCourse(courseId);
    }
    await setupPrisma.proficiencyLevel.deleteMany({ where: { userId: { in: createdUserIds } } });
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

  /** Authors and publishes a course with one READING activity per given cefrLevel, returning languageId + activity titles keyed by level. */
  async function publishedCourseWithReadingActivities(
    cefrLevels: string[],
  ): Promise<{ languageId: string }> {
    const admin = await freshAdminSession();
    const languageId = await freshLanguage();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

    const courseRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
      languageId,
      title: 'Spanish Reading',
      slug: `spanish-reading-${randomUUID().slice(0, 8)}`,
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
    const lessonId = lessonRes.body.id as string;

    for (const [index, cefrLevel] of cefrLevels.entries()) {
      await auth(
        request(app.getHttpServer()).post(`/v1/admin/lessons/${lessonId}/activities`),
      ).send({
        type: 'READING',
        title: `Passage ${cefrLevel}`,
        content: { passage: `Passage text for ${cefrLevel}`, cefrLevel },
        order: index + 1,
      });
    }

    await auth(request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/publish`)).send({});
    return { languageId };
  }

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app.getHttpServer()).get(
      `/v1/reading-activities/matched?languageId=${randomUUID()}`,
    );
    expect(res.status).toBe(401);
  });

  it("orders published READING activities by nearest CEFR distance to the caller's own ProficiencyLevel", async () => {
    const { languageId } = await publishedCourseWithReadingActivities(['A1', 'B1', 'B2', 'C2']);
    const learner = await freshSession();
    await setupPrisma.proficiencyLevel.create({
      data: {
        userId: learner.userId,
        languageId,
        skill: 'READING',
        cefrLevel: 'B1',
        confidence: 0.8,
        source: 'ASSESSMENT',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/reading-activities/matched?languageId=${languageId}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.matchedCefrLevel).toBe('B1');
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data.map((a: { title: string }) => a.title)).toEqual([
      'Passage B1',
      'Passage B2',
      'Passage A1',
      'Passage C2',
    ]);
    expect(res.body.data[0].content).toEqual({
      passage: 'Passage text for B1',
      cefrLevel: 'B1',
    });
  });

  it('defaults to A1 for a learner never assessed (no ProficiencyLevel row)', async () => {
    const { languageId } = await publishedCourseWithReadingActivities(['A1', 'C1']);
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .get(`/v1/reading-activities/matched?languageId=${languageId}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.matchedCefrLevel).toBe('A1');
    expect(res.body.data.map((a: { title: string }) => a.title)).toEqual([
      'Passage A1',
      'Passage C1',
    ]);
  });

  it('never returns a READING activity from an unpublished (draft) course', async () => {
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
    ).send({ title: 'Lesson 1', order: 1, estimatedMinutes: 5 });
    await auth(
      request(app.getHttpServer()).post(
        `/v1/admin/lessons/${lessonRes.body.id as string}/activities`,
      ),
    ).send({
      type: 'READING',
      title: 'Draft Passage',
      content: { passage: 'Draft', cefrLevel: 'A1' },
      order: 1,
    });
    // Deliberately never published.

    const learner = await freshSession();
    const res = await request(app.getHttpServer())
      .get(`/v1/reading-activities/matched?languageId=${languageId}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});
