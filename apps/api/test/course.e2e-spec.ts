import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import { createDomainEventsQueue, type DomainEvent } from '@linguaai/events';
import cookieParser from 'cookie-parser';
import type { Job } from 'bullmq';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E8 T1/T2, §6.1/§6.2).
 * T1's own evidence bar: an ADMIN can author a full Course -> Level ->
 * Unit -> Lesson -> Activity -> Exercise chain, publish it (backfilling a
 * real ContentVersion snapshot for every leaf entity), and a subsequent
 * edit to a *published* entity creates a new version without
 * retroactively changing an already-recorded ExerciseAttempt's own pin —
 * `ContentVersion`'s own stated purpose (DATABASE.md §2.3). T2's own
 * evidence bar: an authored-and-published course is fully browsable
 * (published-only reads, never leaking a draft course or an Exercise's
 * own `correctAnswer`) and completable end to end via the real
 * `POST /v1/exercises/:id/attempts` endpoint, which really does pin each
 * attempt to the exercise's own current `ContentVersion`.
 */
describe('CourseModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdLanguageIds: string[] = [];
  const createdCourseIds: string[] = [];
  let inspectorQueue: ReturnType<typeof createDomainEventsQueue>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is not set — this suite requires a real Redis instance.');
    }
    inspectorQueue = createDomainEventsQueue(redisUrl);
  });

  /**
   * Polls the real `domain-events` queue for a job matching `type`/`userId`
   * (E8 T3, §6.3) — `domain-events.e2e-spec.ts`'s own doc comment already
   * establishes the platform's deliberate scoping: one real-Redis proof of
   * the underlying publish mechanism is enough, not one per event. This
   * suite reuses that same real queue *not* to re-prove the transport, but
   * to prove this task's own new query logic (completion detection, score
   * aggregation) against real Postgres data actually produces the right
   * event at the right moment — the class of bug a Prisma-mocked unit test
   * can't catch (nested `where` shape, `distinct` behavior).
   */
  async function findPublishedJob(
    type: string,
    userId: string,
    timeoutMs = 5000,
  ): Promise<Job<DomainEvent> | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const jobs = await inspectorQueue.getJobs(['waiting', 'active', 'completed']);
      const match = jobs.find(
        (job) => job.name === type && (job.data as DomainEvent).userId === userId,
      );
      if (match) {
        return match as Job<DomainEvent>;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return undefined;
  }

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
    if (inspectorQueue) {
      await inspectorQueue.close();
    }
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

  /**
   * Authors and publishes a real Course -> Level -> Unit -> Lesson ->
   * Activity chain with one Exercise of each objective type, for T2's own
   * learner-facing/attempt tests. Returns every id a test needs plus the
   * `admin`/`languageId` used, so callers can extend the chain further
   * (e.g. adding a second draft course) without re-deriving them.
   */
  async function authorAndPublishCourse(): Promise<{
    admin: RegisteredSession;
    languageId: string;
    courseId: string;
    lessonId: string;
    activityId: string;
    exerciseIds: Record<
      | 'MULTIPLE_CHOICE'
      | 'FILL_BLANK'
      | 'TRANSLATION'
      | 'MATCHING'
      | 'LISTENING_COMPREHENSION'
      | 'SPEAKING_PROMPT',
      string
    >;
  }> {
    const admin = await freshAdminSession();
    const languageId = await freshLanguage();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

    const courseRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
      languageId,
      title: 'Spanish for Travel',
      slug: `spanish-for-travel-${randomUUID().slice(0, 8)}`,
    });
    const courseId = courseRes.body.id as string;
    createdCourseIds.push(courseId);

    const levelRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/levels`),
    ).send({ cefrLevel: 'A1', title: 'Beginner', order: 1 });
    const unitRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/levels/${levelRes.body.id as string}/units`),
    ).send({ title: 'Greetings', order: 1 });
    const lessonRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/units/${unitRes.body.id as string}/lessons`),
    ).send({ title: 'Saying Hello', order: 1, estimatedMinutes: 5 });
    const lessonId = lessonRes.body.id as string;
    const activityRes = await auth(
      request(app.getHttpServer()).post(`/v1/admin/lessons/${lessonId}/activities`),
    ).send({
      type: 'READING',
      title: 'Basic Greetings',
      content: { passage: 'Hola, ¿cómo estás?', cefrLevel: 'A1' },
      order: 1,
    });
    const activityId = activityRes.body.id as string;

    async function createExercise(
      type: string,
      prompt: string,
      correctAnswer: Record<string, unknown>,
      order: number,
    ): Promise<string> {
      const res = await auth(
        request(app.getHttpServer()).post(`/v1/admin/activities/${activityId}/exercises`),
      ).send({ type, prompt, correctAnswer, order });
      return res.body.id as string;
    }

    const exerciseIds = {
      MULTIPLE_CHOICE: await createExercise(
        'MULTIPLE_CHOICE',
        'How do you say hello in Spanish?',
        { correctIndex: 0 },
        1,
      ),
      FILL_BLANK: await createExercise(
        'FILL_BLANK',
        'Complete: ___, como estas?',
        { acceptable: ['Hola'] },
        2,
      ),
      TRANSLATION: await createExercise(
        'TRANSLATION',
        'Translate "goodbye" to Spanish',
        { acceptable: ['Adios', 'adios'] },
        3,
      ),
      MATCHING: await createExercise(
        'MATCHING',
        'Match the Spanish word to its English meaning',
        {
          pairs: [
            { left: 'Hola', right: 'Hello' },
            { left: 'Adios', right: 'Goodbye' },
          ],
        },
        4,
      ),
      LISTENING_COMPREHENSION: await createExercise(
        'LISTENING_COMPREHENSION',
        'Listen and choose what was said',
        { correctIndex: 1 },
        5,
      ),
      SPEAKING_PROMPT: await createExercise(
        'SPEAKING_PROMPT',
        'Say "hello" out loud',
        { transcript: 'hola' },
        6,
      ),
    };

    await auth(request(app.getHttpServer()).post(`/v1/admin/courses/${courseId}/publish`)).send({});

    return { admin, languageId, courseId, lessonId, activityId, exerciseIds };
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
      ).send({
        type: 'READING',
        title: 'Basic Greetings',
        content: { passage: 'Hola, ¿cómo estás?', cefrLevel: 'A1' },
        order: 1,
      });
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

  describe('learner-facing catalog reads (E8 T2, §6.2)', () => {
    it('rejects unauthenticated requests to every read route with 401', async () => {
      const listRes = await request(app.getHttpServer()).get('/v1/courses');
      const detailRes = await request(app.getHttpServer()).get(`/v1/courses/${randomUUID()}`);
      const lessonRes = await request(app.getHttpServer()).get(`/v1/lessons/${randomUUID()}`);
      expect(listRes.status).toBe(401);
      expect(detailRes.status).toBe(401);
      expect(lessonRes.status).toBe(401);
    });

    it('GET /v1/courses only ever lists published courses, filterable by languageId', async () => {
      const { admin, languageId, courseId } = await authorAndPublishCourse();
      const auth = (req: request.Test) => req.set('Authorization', `Bearer ${admin.accessToken}`);

      // A second, never-published course for the same language must never
      // appear in the catalog a learner sees.
      const draftRes = await auth(request(app.getHttpServer()).post('/v1/admin/courses')).send({
        languageId,
        title: 'Never Published',
        slug: `never-published-${randomUUID().slice(0, 8)}`,
      });
      createdCourseIds.push(draftRes.body.id as string);

      const learner = await freshSession();
      const listRes = await request(app.getHttpServer())
        .get(`/v1/courses?languageId=${languageId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);

      expect(listRes.status).toBe(200);
      const ids = (listRes.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(courseId);
      expect(ids).not.toContain(draftRes.body.id);
      expect(listRes.body.meta).toEqual(
        expect.objectContaining({ page: 1, pageSize: 20 }) as unknown,
      );
    }, 30000);

    it('GET /v1/courses/:id returns the Level -> Unit -> Lesson outline for a published course, and 404s for a draft one', async () => {
      const { admin, languageId, courseId, lessonId } = await authorAndPublishCourse();
      const learner = await freshSession();

      const detailRes = await request(app.getHttpServer())
        .get(`/v1/courses/${courseId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(detailRes.status).toBe(200);
      const lessonIds = (
        detailRes.body.levels as Array<{ units: Array<{ lessons: Array<{ id: string }> }> }>
      ).flatMap((l) => l.units.flatMap((u) => u.lessons.map((les) => les.id)));
      expect(lessonIds).toContain(lessonId);

      const draftRes = await request(app.getHttpServer())
        .post('/v1/admin/courses')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ languageId, title: 'Draft', slug: `draft-${randomUUID().slice(0, 8)}` });
      createdCourseIds.push(draftRes.body.id as string);

      const draftDetailRes = await request(app.getHttpServer())
        .get(`/v1/courses/${draftRes.body.id as string}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(draftDetailRes.status).toBe(404);
    }, 30000);

    it("GET /v1/lessons/:id serves the lesson's own Activities/Exercises without ever leaking correctAnswer", async () => {
      const { lessonId } = await authorAndPublishCourse();
      const learner = await freshSession();

      const res = await request(app.getHttpServer())
        .get(`/v1/lessons/${lessonId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.activities).toHaveLength(1);
      const exercises = res.body.activities[0].exercises as Array<Record<string, unknown>>;
      expect(exercises.length).toBeGreaterThan(0);
      for (const exercise of exercises) {
        expect(exercise.correctAnswer).toBeUndefined();
        expect(exercise.prompt).toEqual(expect.any(String));
      }
    }, 30000);
  });

  describe('exercise-attempt submission (E8 T2, §6.2)', () => {
    it('rejects an unauthenticated attempt with 401', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/exercises/${randomUUID()}/attempts`)
        .send({ response: { selectedIndex: 0 } });
      expect(res.status).toBe(401);
    });

    it("scores every objective ExerciseType correctly and pins each attempt to the exercise's own current ContentVersion", async () => {
      const { exerciseIds } = await authorAndPublishCourse();
      const learner = await freshSession();
      const auth = (req: request.Test) => req.set('Authorization', `Bearer ${learner.accessToken}`);

      const cases: Array<{ id: string; response: Record<string, unknown>; expected: boolean }> = [
        { id: exerciseIds.MULTIPLE_CHOICE, response: { selectedIndex: 0 }, expected: true },
        { id: exerciseIds.MULTIPLE_CHOICE, response: { selectedIndex: 1 }, expected: false },
        { id: exerciseIds.FILL_BLANK, response: { text: 'hola' }, expected: true },
        { id: exerciseIds.FILL_BLANK, response: { text: 'nope' }, expected: false },
        { id: exerciseIds.TRANSLATION, response: { text: 'Adios' }, expected: true },
        {
          id: exerciseIds.MATCHING,
          response: {
            matches: [
              { left: 'Hola', right: 'Hello' },
              { left: 'Adios', right: 'Goodbye' },
            ],
          },
          expected: true,
        },
        { id: exerciseIds.LISTENING_COMPREHENSION, response: { selectedIndex: 1 }, expected: true },
      ];

      for (const testCase of cases) {
        const res = await auth(
          request(app.getHttpServer()).post(`/v1/exercises/${testCase.id}/attempts`),
        ).send({ response: testCase.response });
        expect(res.status).toBe(201);
        expect(res.body.isCorrect).toBe(testCase.expected);
        expect(res.body.score).toBe(testCase.expected ? 1 : 0);

        const attempt = await setupPrisma.exerciseAttempt.findUnique({
          where: { id: res.body.id as string },
        });
        const currentVersion = await setupPrisma.contentVersion.findFirst({
          where: { entityType: 'EXERCISE', entityId: testCase.id },
          orderBy: { versionNumber: 'desc' },
        });
        expect(attempt?.contentVersionId).toBe(currentVersion!.id);
      }

      await setupPrisma.exerciseAttempt.deleteMany({ where: { userId: learner.userId } });
    }, 30000);

    it("rejects a SPEAKING_PROMPT attempt with 422 — out of this epic's own scope until services/speech-service (E10)", async () => {
      const { exerciseIds } = await authorAndPublishCourse();
      const learner = await freshSession();

      const res = await request(app.getHttpServer())
        .post(`/v1/exercises/${exerciseIds.SPEAKING_PROMPT}/attempts`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ response: { text: 'hola' } });

      expect(res.status).toBe(422);
    }, 30000);

    it('returns 404 for an attempt against a non-existent exercise', async () => {
      const learner = await freshSession();
      const res = await request(app.getHttpServer())
        .post(`/v1/exercises/${randomUUID()}/attempts`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ response: { selectedIndex: 0 } });
      expect(res.status).toBe(404);
    });

    it("returns 404 (not leaking existence) for an attempt against a draft course's exercise", async () => {
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
      const exerciseRes = await auth(
        request(app.getHttpServer()).post(
          `/v1/admin/activities/${activityRes.body.id as string}/exercises`,
        ),
      ).send({
        type: 'MULTIPLE_CHOICE',
        prompt: 'p',
        correctAnswer: { correctIndex: 0 },
        order: 1,
      });

      const learner = await freshSession();
      const res = await request(app.getHttpServer())
        .post(`/v1/exercises/${exerciseRes.body.id as string}/attempts`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ response: { selectedIndex: 0 } });
      expect(res.status).toBe(404);
    }, 30000);
  });

  describe('domain event emission (E8 T3, §6.3)', () => {
    it('publishes a real learning.exercise.answered job on every attempt, and learning.lesson.completed only once every exercise has been attempted', async () => {
      const { exerciseIds } = await authorAndPublishCourse();
      const learner = await freshSession();
      const auth = (req: request.Test) => req.set('Authorization', `Bearer ${learner.accessToken}`);

      const firstAttemptRes = await auth(
        request(app.getHttpServer()).post(`/v1/exercises/${exerciseIds.MULTIPLE_CHOICE}/attempts`),
      ).send({ response: { selectedIndex: 0 } });
      expect(firstAttemptRes.status).toBe(201);

      const answeredJob = await findPublishedJob('learning.exercise.answered', learner.userId);
      expect(answeredJob?.data).toEqual(
        expect.objectContaining({
          type: 'learning.exercise.answered',
          producedBy: 'apps/api',
          userId: learner.userId,
          payload: {
            userId: learner.userId,
            exerciseId: exerciseIds.MULTIPLE_CHOICE,
            correct: true,
          },
        }),
      );

      // Only one of the lesson's five attemptable exercises has been
      // attempted so far — the lesson must not be reported complete yet.
      const tooEarly = await findPublishedJob('learning.lesson.completed', learner.userId, 500);
      expect(tooEarly).toBeUndefined();

      // Attempt the remaining four attemptable exercises (SPEAKING_PROMPT
      // is deliberately never attempted — §1's own scope exclusion — and
      // must not block completion).
      await auth(
        request(app.getHttpServer()).post(`/v1/exercises/${exerciseIds.FILL_BLANK}/attempts`),
      ).send({ response: { text: 'Hola' } });
      await auth(
        request(app.getHttpServer()).post(`/v1/exercises/${exerciseIds.TRANSLATION}/attempts`),
      ).send({ response: { text: 'Adios' } });
      await auth(
        request(app.getHttpServer()).post(`/v1/exercises/${exerciseIds.MATCHING}/attempts`),
      ).send({
        response: {
          matches: [
            { left: 'Hola', right: 'Hello' },
            { left: 'Adios', right: 'Goodbye' },
          ],
        },
      });
      await auth(
        request(app.getHttpServer()).post(
          `/v1/exercises/${exerciseIds.LISTENING_COMPREHENSION}/attempts`,
        ),
      ).send({ response: { selectedIndex: 1 } });

      const completedJob = await findPublishedJob('learning.lesson.completed', learner.userId);
      expect(completedJob?.data).toEqual(
        expect.objectContaining({
          type: 'learning.lesson.completed',
          producedBy: 'apps/api',
          userId: learner.userId,
          payload: expect.objectContaining({ userId: learner.userId, score: 1 }) as unknown,
        }),
      );

      // Re-attempting an already-completed exercise must not publish a
      // second, redundant learning.lesson.completed.
      const jobsBeforeReattempt = (
        await inspectorQueue.getJobs(['waiting', 'active', 'completed'])
      ).filter(
        (j) =>
          j.name === 'learning.lesson.completed' &&
          (j.data as DomainEvent).userId === learner.userId,
      ).length;
      await auth(
        request(app.getHttpServer()).post(`/v1/exercises/${exerciseIds.MULTIPLE_CHOICE}/attempts`),
      ).send({ response: { selectedIndex: 0 } });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const jobsAfterReattempt = (
        await inspectorQueue.getJobs(['waiting', 'active', 'completed'])
      ).filter(
        (j) =>
          j.name === 'learning.lesson.completed' &&
          (j.data as DomainEvent).userId === learner.userId,
      ).length;
      expect(jobsAfterReattempt).toBe(jobsBeforeReattempt);
    }, 30000);
  });
});
