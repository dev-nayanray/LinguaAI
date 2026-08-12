import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { SpeechServiceClientService } from '../src/modules/speech-service-client/speech-service-client.service.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E12 T1, design doc §6.2,
 * ADR-051). `SpeechServiceClientService` is stubbed entirely — mirroring
 * `pronunciation-lab.e2e-spec.ts`'s own established "mock the boundary, not
 * the system under test" discipline: `synthesizeSpeech` is a real HTTP call
 * to a separately-deployed `services/speech-service` process this test
 * environment doesn't run. What this suite verifies for real:
 * `LessonContentController`'s own auth/validation for a `LISTENING`
 * activity's *draft* request shape (`{ script }`), and that the real
 * persisted `Activity.content` row ends up with the real, synthesized
 * `{ audioUrl, transcript }` shape — never the draft shape.
 */
describe('LessonContentController — LISTENING synthesis (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdLanguageIds: string[] = [];
  const createdCourseIds: string[] = [];
  const synthesizeSpeech = jest.fn();
  const speechServiceClientStub: Pick<SpeechServiceClientService, 'synthesizeSpeech'> = {
    synthesizeSpeech,
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SpeechServiceClientService)
      .useValue(speechServiceClientStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterEach(() => {
    synthesizeSpeech.mockReset();
  });

  /** Bottom-up cascade delete, mirroring course.e2e-spec.ts's own established cleanup discipline. */
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
    await setupPrisma.contentVersion.deleteMany({
      where: { entityId: { in: [...lessonIds, ...activityIds] } },
    });
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

  /** Mirrors course.e2e-spec.ts's own established helper: enroll MFA as USER, promote to ADMIN, re-login (MfaGuard blocks ADMIN routes pre-MFA-verify, ADR-011). */
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

  async function freshLesson(admin: RegisteredSession): Promise<string> {
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
    ).send({ title: 'Ordering Coffee', order: 1, estimatedMinutes: 5 });
    return lessonRes.body.id as string;
  }

  it('rejects a LISTENING activity create request missing the draft script with 400, never calling speech-service', async () => {
    const admin = await freshAdminSession();
    const lessonId = await freshLesson(admin);

    const res = await request(app.getHttpServer())
      .post(`/v1/admin/lessons/${lessonId}/activities`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ type: 'LISTENING', title: 'Ordering Coffee', content: {}, order: 1 });

    expect(res.status).toBe(400);
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('synthesizes a drafted LISTENING script into real, persisted audioUrl/transcript content', async () => {
    const admin = await freshAdminSession();
    const lessonId = await freshLesson(admin);
    synthesizeSpeech.mockResolvedValue('https://storage.example.com/synthesized/coffee.mp3');

    const res = await request(app.getHttpServer())
      .post(`/v1/admin/lessons/${lessonId}/activities`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        type: 'LISTENING',
        title: 'Ordering Coffee',
        content: { script: 'Hola, quiero un café.' },
        order: 1,
      });

    expect(res.status).toBe(201);
    expect(synthesizeSpeech).toHaveBeenCalledWith('Hola, quiero un café.');
    expect(res.body.content).toEqual({
      audioUrl: 'https://storage.example.com/synthesized/coffee.mp3',
      transcript: 'Hola, quiero un café.',
    });

    const activity = await setupPrisma.activity.findUniqueOrThrow({
      where: { id: res.body.id as string },
    });
    expect(activity.content).toEqual({
      audioUrl: 'https://storage.example.com/synthesized/coffee.mp3',
      transcript: 'Hola, quiero un café.',
    });
  });
});
