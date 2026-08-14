import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AiEngineClientService } from '../src/modules/ai-engine/ai-engine-client.service.js';
import { SpeechServiceClientService } from '../src/modules/speech-service-client/speech-service-client.service.js';
import { registerAndLogin, TEST_PASSWORD, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E19 T1/T2, design doc §5).
 * `SpeechServiceClientService`/`AiEngineClientService` are both stubbed —
 * mirroring `listening-content.e2e-spec.ts`'s (E12 T1) and
 * `writing-submissions.e2e-spec.ts`'s (E13 T2) own established "mock the
 * boundary, not the system under test" discipline: both are real HTTP
 * calls to separately-deployed processes this test environment doesn't run
 * with real credentials (RISK_REGISTER R-88). What this suite verifies for
 * real: `ADMIN` authoring of a full `ExamProgram` + four
 * `MockTestSection`s, that a `LISTENING` section's real persisted content
 * ends up with the server-side-synthesized `{ audioUrl, transcript,
 * questions }` shape, the learner-facing catalog/attempt-start flow,
 * `correctIndex` never reaching a learner, real objective Reading/Listening
 * scoring against the section's own real answer key, real AI-scored
 * Writing/Speaking sections, and real overall band aggregation on
 * completion.
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
  const scoreExamSection = jest.fn();
  const aiEngineClientStub: Pick<AiEngineClientService, 'scoreExamSection'> = {
    scoreExamSection,
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SpeechServiceClientService)
      .useValue(speechServiceClientStub)
      .overrideProvider(AiEngineClientService)
      .useValue(aiEngineClientStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterEach(() => {
    synthesizeSpeech.mockReset();
    scoreExamSection.mockReset();
  });

  afterAll(async () => {
    await setupPrisma.mockTestSectionScore.deleteMany({
      where: { mockTestAttempt: { examProgramId: { in: createdExamProgramIds } } },
    });
    await setupPrisma.mockTestAttempt.deleteMany({
      where: { examProgramId: { in: createdExamProgramIds } },
    });
    await setupPrisma.mockTestSection.deleteMany({
      where: { examProgramId: { in: createdExamProgramIds } },
    });
    await setupPrisma.examProgram.deleteMany({ where: { id: { in: createdExamProgramIds } } });
    await setupPrisma.certificate.deleteMany({ where: { userId: { in: createdUserIds } } });
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

  describe('section-response submission & completion (T2)', () => {
    async function startIeltsAttempt(learner: RegisteredSession): Promise<string> {
      const ielts = await setupPrisma.examProgram.findUniqueOrThrow({ where: { code: 'IELTS' } });
      const startRes = await request(app.getHttpServer())
        .post('/v1/mock-test-attempts')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ examProgramId: ielts.id });
      expect(startRes.status).toBe(201);
      return startRes.body.id as string;
    }

    it('objectively scores Reading/Listening against the real seeded answer key and computes a real overall band on completion', async () => {
      const learner = await freshSession();
      const attemptId = await startIeltsAttempt(learner);

      // Real seeded IELTS Reading answer key (packages/database/scripts/seed.ts): both correct -> 100% -> band 9.
      const readingRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/READING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({
          answers: [
            { questionIndex: 0, selectedIndex: 2 },
            { questionIndex: 1, selectedIndex: 1 },
          ],
        });
      expect(readingRes.status).toBe(201);
      expect(readingRes.body).toEqual({ skill: 'READING', score: 9, feedback: null });

      // Real seeded IELTS Listening answer key: correct -> 100% -> band 9.
      const listeningRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/LISTENING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ answers: [{ questionIndex: 0, selectedIndex: 1 }] });
      expect(listeningRes.status).toBe(201);
      expect(listeningRes.body).toEqual({ skill: 'LISTENING', score: 9, feedback: null });

      scoreExamSection.mockResolvedValueOnce({ band: 6.5, feedback: 'Solid task response.' });
      const writingRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/WRITING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ text: 'The chart shows internet access rising steadily from 2000 to 2020.' });
      expect(writingRes.status).toBe(201);
      expect(writingRes.body).toEqual({
        skill: 'WRITING',
        score: 6.5,
        feedback: 'Solid task response.',
      });
      expect(scoreExamSection).toHaveBeenCalledWith(expect.objectContaining({ skill: 'WRITING' }));

      scoreExamSection.mockResolvedValueOnce({
        band: 6,
        feedback: 'Fairly fluent, some hesitation.',
      });
      const speakingRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/SPEAKING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ text: 'I grew up in a small town near the coast.' });
      expect(speakingRes.status).toBe(201);
      expect(speakingRes.body).toEqual({
        skill: 'SPEAKING',
        score: 6,
        feedback: 'Fairly fluent, some hesitation.',
      });

      // mean(9, 9, 6.5, 6) = 7.625 -> rounds to 7.5.
      const completeRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/complete`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.status).toBe('COMPLETED');
      expect(completeRes.body.overallScore).toBe(7.5);

      // A real Certificate is issued on completion (T3, §3.7) — the raw
      // verification token is returned exactly once, here.
      expect(typeof completeRes.body.certificateVerificationToken).toBe('string');
      const certificate = await setupPrisma.certificate.findFirst({
        where: {
          userId: learner.userId,
          examProgramId: (
            await setupPrisma.examProgram.findUniqueOrThrow({ where: { code: 'IELTS' } })
          ).id,
        },
      });
      expect(certificate).not.toBeNull();
      expect(certificate!.verificationTokenHash).not.toBe(
        completeRes.body.certificateVerificationToken,
      );

      // Idempotent on repeat calls — matches AssessmentService's own established contract. No second Certificate, no raw token to return.
      const repeatCompleteRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/complete`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(repeatCompleteRes.status).toBe(200);
      expect(repeatCompleteRes.body.overallScore).toBe(7.5);
      expect(repeatCompleteRes.body.certificateVerificationToken).toBeNull();
      const certificateCountAfterRepeat = await setupPrisma.certificate.count({
        where: { userId: learner.userId },
      });
      expect(certificateCountAfterRepeat).toBe(1);

      // GET /v1/mock-test-attempts (T3) — historical listing, own only, newest first.
      const listRes = await request(app.getHttpServer())
        .get('/v1/mock-test-attempts')
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((a: { id: string }) => a.id === attemptId)).toBe(true);
      expect(listRes.body.meta.total).toBeGreaterThanOrEqual(1);

      await setupPrisma.certificate.deleteMany({ where: { userId: learner.userId } });
      await setupPrisma.mockTestSectionScore.deleteMany({
        where: { mockTestAttemptId: attemptId },
      });
      await setupPrisma.mockTestAttempt.delete({ where: { id: attemptId } });
    });

    it('rejects completing an attempt before every section has been scored', async () => {
      const learner = await freshSession();
      const attemptId = await startIeltsAttempt(learner);

      const readingRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/READING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ answers: [{ questionIndex: 0, selectedIndex: 2 }] });
      expect(readingRes.status).toBe(201);

      const completeRes = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/complete`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(completeRes.status).toBe(409);

      await setupPrisma.mockTestSectionScore.deleteMany({
        where: { mockTestAttemptId: attemptId },
      });
      await setupPrisma.mockTestAttempt.delete({ where: { id: attemptId } });
    });

    it('rejects submitting a response twice for the same section', async () => {
      const learner = await freshSession();
      const attemptId = await startIeltsAttempt(learner);

      const first = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/READING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ answers: [{ questionIndex: 0, selectedIndex: 2 }] });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/READING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ answers: [{ questionIndex: 0, selectedIndex: 2 }] });
      expect(second.status).toBe(409);

      await setupPrisma.mockTestSectionScore.deleteMany({
        where: { mockTestAttemptId: attemptId },
      });
      await setupPrisma.mockTestAttempt.delete({ where: { id: attemptId } });
    });

    it('rejects submitting "text" for an objectively-scored Reading section', async () => {
      const learner = await freshSession();
      const attemptId = await startIeltsAttempt(learner);

      const res = await request(app.getHttpServer())
        .post(`/v1/mock-test-attempts/${attemptId}/sections/READING/responses`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ text: 'not valid for this skill' });
      expect(res.status).toBe(409);

      await setupPrisma.mockTestAttempt.delete({ where: { id: attemptId } });
    });

    it("GET /v1/mock-test-attempts scopes results to the caller's own attempts only, rejects unauthenticated", async () => {
      const unauth = await request(app.getHttpServer()).get('/v1/mock-test-attempts');
      expect(unauth.status).toBe(401);

      const owner = await freshSession();
      const intruder = await freshSession();
      const ownerAttemptId = await startIeltsAttempt(owner);
      await startIeltsAttempt(intruder);

      const res = await request(app.getHttpServer())
        .get('/v1/mock-test-attempts')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((a) => a.id);
      expect(ids).toContain(ownerAttemptId);
      for (const attempt of res.body.data as { userId: string }[]) {
        expect(attempt.userId).toBe(owner.userId);
      }

      await setupPrisma.mockTestAttempt.deleteMany({
        where: { userId: { in: [owner.userId, intruder.userId] } },
      });
    });
  });
});
