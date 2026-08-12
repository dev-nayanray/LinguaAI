import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import type { ContentDraftLesson } from '@linguaai/validation/content';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AiEngineClientService } from '../src/modules/ai-engine/ai-engine-client.service.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

const STUB_DRAFT: ContentDraftLesson = {
  title: 'Ordering Food',
  description: 'Learn key phrases for ordering food at a restaurant.',
  estimatedMinutes: 10,
  activities: [
    {
      type: 'READING',
      title: 'At the Restaurant',
      content: { passage: 'Quisiera una mesa para dos, por favor.' },
      exercises: [
        {
          type: 'MULTIPLE_CHOICE',
          prompt: 'What does "una mesa para dos" mean?',
          correctAnswer: { correctIndex: 0 },
        },
      ],
    },
  ],
};

/**
 * Real integration tests against live Postgres (E8 T4, §6.4).
 * `ContentDraftingService.draftLesson()` calls a real LLM over HTTP —
 * genuinely unavailable in this environment (no live LLM provider
 * credentials, RISK_REGISTER R-88, the same limitation
 * `assessment.e2e-spec.ts`'s own honestly-reported evidence bar already
 * carries for `AssessmentScoringService`). Overriding just
 * `AiEngineClientService` keeps everything else in the request path real
 * (Postgres, real MFA/role enforcement, the actual `ContentAuthoringController`
 * HTTP layer) — only the genuinely-external network boundary is stubbed,
 * the same "mock the boundary, not the system under test" discipline
 * `assessment.e2e-spec.ts` already established for the identical class of
 * gap.
 */
describe('ContentAuthoringController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const draftLesson = jest.fn().mockResolvedValue(STUB_DRAFT);
  const aiEngineClientStub: Pick<AiEngineClientService, 'draftLesson'> = { draftLesson };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AiEngineClientService)
      .useValue(aiEngineClientStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterEach(() => {
    draftLesson.mockClear();
  });

  afterAll(async () => {
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

  /** Mirrors course.e2e-spec.ts's own established helper: enroll MFA as USER, promote to ADMIN, re-login (MfaGuard blocks ADMIN routes pre-MFA-verify, ADR-011). */
  async function freshAdminSession(): Promise<RegisteredSession> {
    const session = await freshSession();
    const enrollRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .set('Authorization', `Bearer ${session.accessToken}`);
    const secret = enrollRes.body.secret as string;
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ secret, code: authenticator.generate(secret) });
    await setupPrisma.user.update({ where: { id: session.userId }, data: { role: 'ADMIN' } });
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: session.email, password: TEST_PASSWORD });
    const challengeRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/challenge')
      .send({ challengeToken: loginRes.body.challengeToken, code: authenticator.generate(secret) });
    return { ...session, accessToken: challengeRes.body.accessToken as string };
  }

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app.getHttpServer()).post('/v1/admin/lessons/ai-draft').send({
      languageId: randomUUID(),
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2',
      topic: 'x',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a plain USER (non-ADMIN) with 403', async () => {
    const session = await freshSession();
    const res = await request(app.getHttpServer())
      .post('/v1/admin/lessons/ai-draft')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        languageId: randomUUID(),
        targetLanguageName: 'Spanish',
        cefrLevel: 'A2',
        topic: 'x',
      });
    expect(res.status).toBe(403);
    expect(draftLesson).not.toHaveBeenCalled();
  });

  it('an ADMIN receives the (stubbed) draft, and the endpoint itself never persists anything', async () => {
    const admin = await freshAdminSession();
    const languageId = randomUUID();

    const res = await request(app.getHttpServer())
      .post('/v1/admin/lessons/ai-draft')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        languageId,
        targetLanguageName: 'Spanish',
        cefrLevel: 'A2',
        topic: 'Ordering food at a restaurant',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(STUB_DRAFT);
    expect(draftLesson).toHaveBeenCalledWith({
      languageId,
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2',
      topic: 'Ordering food at a restaurant',
    });

    // The draft is a pure proposal — no Lesson/Activity/Exercise row was
    // ever created by this call (§6.4's own "never auto-published" bar).
    const lessonCount = await setupPrisma.lesson.count({ where: { title: STUB_DRAFT.title } });
    expect(lessonCount).toBe(0);
  }, 15000);

  it('returns 400 for a malformed request body (invalid cefrLevel)', async () => {
    const admin = await freshAdminSession();
    const res = await request(app.getHttpServer())
      .post('/v1/admin/lessons/ai-draft')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        languageId: randomUUID(),
        targetLanguageName: 'Spanish',
        cefrLevel: 'not-a-real-level',
        topic: 'x',
      });
    expect(res.status).toBe(400);
    expect(draftLesson).not.toHaveBeenCalled();
  }, 15000);
});
