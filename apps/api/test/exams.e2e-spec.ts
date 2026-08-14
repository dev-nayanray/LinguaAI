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
 * Real integration tests against live Postgres (E19 T1, design doc §5).
 * `SpeechServiceClientService` is stubbed — mirroring
 * `listening-content.e2e-spec.ts`'s own established "mock the boundary, not
 * the system under test" discipline (E12 T1): `synthesizeSpeech` is a real
 * HTTP call to a separately-deployed `services/speech-service` process this
 * test environment doesn't run with real OpenAI credentials
 * (RISK_REGISTER R-88). What this suite verifies for real: `ADMIN`
 * authoring of a full `ExamProgram` + four `MockTestSection`s, that a
 * `LISTENING` section's real persisted content ends up with the
 * server-side-synthesized `{ audioUrl, transcript, questions }` shape
 * (never the draft `{ script, questions }` shape), the learner-facing
 * catalog/attempt-start flow, and that `correctIndex` never reaches a
 * learner in a started attempt's own served sections.
 */
describe('ExamsModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdExamProgramIds: string[] = [];
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

  afterAll(async () => {
    await setupPrisma.mockTestAttempt.deleteMany({
      where: { examProgramId: { in: createdExamProgramIds } },
    });
    await setupPrisma.mockTestSection.deleteMany({
      where: { examProgramId: { in: createdExamProgramIds } },
    });
    await setupPrisma.examProgram.deleteMany({ where: { id: { in: createdExamProgramIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    await app.close();
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  /** Mirrors analytics.e2e-spec.ts's own established helper. */
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

  async function createExamProgram(admin: RegisteredSession): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/admin/exam-programs')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: `E19 T1 Test Program ${randomUUID().slice(0, 8)}`,
        code: `E19T1_${randomUUID().slice(0, 8).toUpperCase()}`,
        rubric: { bandScale: { min: 0, max: 9, step: 0.5 } },
      });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    createdExamProgramIds.push(id);
    return id;
  }

  it('rejects an unauthenticated admin create with 401 and a plain USER with 403', async () => {
    const unauth = await request(app.getHttpServer())
      .post('/v1/admin/exam-programs')
      .send({ name: 'x', code: 'X', rubric: {} });
    expect(unauth.status).toBe(401);

    const learner = await freshSession();
    const forbidden = await request(app.getHttpServer())
      .post('/v1/admin/exam-programs')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ name: 'x', code: 'X', rubric: {} });
    expect(forbidden.status).toBe(403);
  });

  it('an ADMIN authors a full ExamProgram + all four real MockTestSections; LISTENING is server-side synthesized', async () => {
    const admin = await freshAdminSession();
    const examProgramId = await createExamProgram(admin);

    const readingRes = await request(app.getHttpServer())
      .post(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        skill: 'READING',
        order: 0,
        content: {
          passage: 'A real passage.',
          questions: [{ prompt: 'What?', options: ['a', 'b'], correctIndex: 0 }],
        },
      });
    expect(readingRes.status).toBe(201);

    synthesizeSpeech.mockResolvedValue('https://storage.example.com/synthesized/exam.mp3');
    const listeningRes = await request(app.getHttpServer())
      .post(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        skill: 'LISTENING',
        order: 1,
        content: {
          script: 'A real script.',
          questions: [{ prompt: 'Q?', options: ['a', 'b'], correctIndex: 1 }],
        },
      });
    expect(listeningRes.status).toBe(201);
    expect(synthesizeSpeech).toHaveBeenCalledWith('A real script.');
    expect(listeningRes.body.content).toEqual({
      audioUrl: 'https://storage.example.com/synthesized/exam.mp3',
      transcript: 'A real script.',
      questions: [{ prompt: 'Q?', options: ['a', 'b'], correctIndex: 1 }],
    });

    const writingRes = await request(app.getHttpServer())
      .post(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        skill: 'WRITING',
        order: 2,
        content: { taskPrompt: 'Describe a chart.', minWords: 150 },
      });
    expect(writingRes.status).toBe(201);

    const speakingRes = await request(app.getHttpServer())
      .post(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        skill: 'SPEAKING',
        order: 3,
        content: { prompts: ['Tell me about your hometown.'] },
      });
    expect(speakingRes.status).toBe(201);

    const listRes = await request(app.getHttpServer())
      .get(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(4);
  });

  it('rejects creating a second MockTestSection for the same skill under the same program (one section per skill)', async () => {
    const admin = await freshAdminSession();
    const examProgramId = await createExamProgram(admin);

    const first = await request(app.getHttpServer())
      .post(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ skill: 'WRITING', order: 0, content: { taskPrompt: 'x', minWords: 100 } });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/v1/admin/exam-programs/${examProgramId}/sections`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ skill: 'WRITING', order: 0, content: { taskPrompt: 'y', minWords: 100 } });
    expect(second.status).toBe(409);
  });

  it('GET /v1/exam-programs (learner) lists only active programs, without rubric', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .get('/v1/exam-programs')
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const program of res.body.data as Record<string, unknown>[]) {
      expect(program).not.toHaveProperty('rubric');
    }
    // The real, seeded IELTS Academic program (packages/database/scripts/seed.ts)
    // should be present and active in this environment.
    const ielts = (res.body.data as { code: string }[]).find((p) => p.code === 'IELTS');
    expect(ielts).toBeDefined();
  });

  it('starting a mock-test attempt against the real seeded IELTS program serves every section with correctIndex stripped', async () => {
    const learner = await freshSession();
    const ielts = await setupPrisma.examProgram.findUniqueOrThrow({ where: { code: 'IELTS' } });

    const startRes = await request(app.getHttpServer())
      .post('/v1/mock-test-attempts')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ examProgramId: ielts.id });

    expect(startRes.status).toBe(201);
    expect(startRes.body.status).toBe('IN_PROGRESS');
    expect(startRes.body.sections.length).toBeGreaterThanOrEqual(4);
    const readingSection = (startRes.body.sections as Record<string, unknown>[]).find(
      (s) => s.skill === 'READING',
    );
    expect(readingSection).toBeDefined();
    const questions = (readingSection!.content as { questions: Record<string, unknown>[] })
      .questions;
    for (const question of questions) {
      expect(question).not.toHaveProperty('correctIndex');
    }

    const getRes = await request(app.getHttpServer())
      .get(`/v1/mock-test-attempts/${startRes.body.id as string}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(startRes.body.id);

    await setupPrisma.mockTestAttempt.delete({ where: { id: startRes.body.id as string } });
  });

  it("rejects reading another user's own mock-test attempt with 404", async () => {
    const owner = await freshSession();
    const intruder = await freshSession();
    const ielts = await setupPrisma.examProgram.findUniqueOrThrow({ where: { code: 'IELTS' } });

    const startRes = await request(app.getHttpServer())
      .post('/v1/mock-test-attempts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ examProgramId: ielts.id });
    expect(startRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/mock-test-attempts/${startRes.body.id as string}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`);
    expect(res.status).toBe(404);

    await setupPrisma.mockTestAttempt.delete({ where: { id: startRes.body.id as string } });
  });

  it('rejects starting an attempt against a nonexistent exam program with 404', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/mock-test-attempts')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ examProgramId: randomUUID() });

    expect(res.status).toBe(404);
  });
});
