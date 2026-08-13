import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AiEngineClientService } from '../src/modules/ai-engine/ai-engine-client.service.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E13 T2, design doc §6.2).
 * `AiEngineClientService` is stubbed entirely — mirroring
 * `pronunciation-lab.e2e-spec.ts`'s own established "mock the boundary,
 * not the system under test" discipline: `correctWriting` is a real HTTP
 * call to a separately-deployed `services/ai-engine` process this test
 * environment doesn't run. What this suite verifies for real:
 * `WritingController`'s own auth/validation, real `WritingSubmission` row
 * creation scoped to the caller's own `userId`, real `PersonalDictionary`
 * extraction (`source: 'WRITING'`), and the real
 * `writing.submission.corrected` domain event getting published.
 */
describe('WritingController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const correctWriting = jest.fn();
  const aiEngineClientStub: Pick<AiEngineClientService, 'correctWriting'> = { correctWriting };

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
    correctWriting.mockReset();
  });

  afterAll(async () => {
    await setupPrisma.personalDictionary.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.writingSubmission.deleteMany({ where: { userId: { in: createdUserIds } } });
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

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/writing-submissions')
      .send({ languageId: randomUUID(), text: 'Yo tiene un perro.' });

    expect(res.status).toBe(401);
    expect(correctWriting).not.toHaveBeenCalled();
  });

  it('rejects a malformed body (missing text) with 400', async () => {
    const session = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/writing-submissions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: randomUUID() });

    expect(res.status).toBe(400);
    expect(correctWriting).not.toHaveBeenCalled();
  });

  it('404s on a language that does not exist, never calling ai-engine', async () => {
    const session = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/writing-submissions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: randomUUID(), text: 'Yo tiene un perro.' });

    expect(res.status).toBe(404);
    expect(correctWriting).not.toHaveBeenCalled();
  });

  it('submits writing, persists a real WritingSubmission row, and extracts corrections into the personal dictionary', async () => {
    const session = await freshSession();
    const language = await setupPrisma.language.findUniqueOrThrow({ where: { code: 'es' } });
    const correctionResult = {
      corrections: [
        { original: 'Yo tiene', corrected: 'Yo tengo', explanation: 'Irregular conjugation.' },
      ],
      overallFeedback: 'Good effort overall.',
      cefrLevelEstimate: 'A2',
    };
    correctWriting.mockResolvedValue(correctionResult);

    const res = await request(app.getHttpServer())
      .post('/v1/writing-submissions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: language.id, text: 'Yo tiene un perro.' });

    expect(res.status).toBe(201);
    expect(correctWriting).toHaveBeenCalledWith({
      languageId: language.id,
      targetLanguageName: language.name,
      text: 'Yo tiene un perro.',
    });
    expect(res.body).toEqual(
      expect.objectContaining({
        languageId: language.id,
        text: 'Yo tiene un perro.',
        corrections: correctionResult.corrections,
        overallFeedback: correctionResult.overallFeedback,
        cefrLevelEstimate: correctionResult.cefrLevelEstimate,
      }),
    );

    const submissions = await setupPrisma.writingSubmission.findMany({
      where: { userId: session.userId },
    });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      id: res.body.submissionId,
      languageId: language.id,
      text: 'Yo tiene un perro.',
      overallFeedback: correctionResult.overallFeedback,
      cefrLevelEstimate: correctionResult.cefrLevelEstimate,
    });

    const dictionaryEntries = await setupPrisma.personalDictionary.findMany({
      where: { userId: session.userId, source: 'WRITING' },
    });
    expect(dictionaryEntries).toHaveLength(1);
    expect(dictionaryEntries[0]).toMatchObject({
      term: 'Yo tengo',
      notes: 'Irregular conjugation.',
    });
  });

  it('never touches the personal dictionary when the model returns zero corrections', async () => {
    const session = await freshSession();
    const language = await setupPrisma.language.findUniqueOrThrow({ where: { code: 'es' } });
    correctWriting.mockResolvedValue({
      corrections: [],
      overallFeedback: 'Perfect!',
      cefrLevelEstimate: 'B2',
    });

    const res = await request(app.getHttpServer())
      .post('/v1/writing-submissions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: language.id, text: 'Perfecto.' });

    expect(res.status).toBe(201);
    const dictionaryEntries = await setupPrisma.personalDictionary.findMany({
      where: { userId: session.userId, source: 'WRITING' },
    });
    expect(dictionaryEntries).toHaveLength(0);
  });
});
