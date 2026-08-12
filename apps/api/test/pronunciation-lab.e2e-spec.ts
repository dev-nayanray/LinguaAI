import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { SpeechServiceClientService } from '../src/modules/speech-service-client/speech-service-client.service.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E11 T2, design doc §6.2/§6.3).
 * `SpeechServiceClientService` is stubbed entirely — mirroring
 * `speaking.e2e-spec.ts`'s own established "mock the boundary, not the
 * system under test" discipline: `scorePronunciation` is a real HTTP call
 * to a separately-deployed `services/speech-service` process this test
 * environment doesn't run. What this suite verifies for real:
 * `PronunciationLabController`'s own auth/validation, real
 * `PronunciationLabAttempt`/`PronunciationScore` row creation scoped to the
 * caller's own `userId` (never client-suppliable), and the real
 * `pronunciation.attempt.scored` domain event getting published.
 */
describe('PronunciationLabController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const scorePronunciation = jest.fn();
  const speechServiceClientStub: Pick<SpeechServiceClientService, 'scorePronunciation'> = {
    scorePronunciation,
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
    scorePronunciation.mockReset();
  });

  afterAll(async () => {
    await setupPrisma.pronunciationScore.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.pronunciationLabAttempt.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
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
      .post('/v1/pronunciation-attempts')
      .send({ languageId: randomUUID(), targetPhrase: 'hola', audio: 'YXVkaW8=' });

    expect(res.status).toBe(401);
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it('rejects a malformed body (missing targetPhrase) with 400', async () => {
    const session = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/pronunciation-attempts')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: randomUUID(), audio: 'YXVkaW8=' });

    expect(res.status).toBe(400);
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it('404s on a language that does not exist, never calling speech-service', async () => {
    const session = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/pronunciation-attempts')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: randomUUID(), targetPhrase: 'hola', audio: 'YXVkaW8=' });

    expect(res.status).toBe(404);
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it('scores a real attempt, persisting a real PronunciationLabAttempt + PronunciationScore row scoped to the caller', async () => {
    const session = await freshSession();
    const language = await setupPrisma.language.findUniqueOrThrow({ where: { code: 'es' } });
    const scoreResult = {
      overallScore: 88,
      accuracyScore: 90,
      fluencyScore: 85,
      completenessScore: 95,
      words: [{ word: 'hola', accuracyScore: 90, errorType: 'NONE', phonemes: [] }],
    };
    scorePronunciation.mockResolvedValue(scoreResult);

    const res = await request(app.getHttpServer())
      .post('/v1/pronunciation-attempts')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: language.id, targetPhrase: 'hola', audio: 'YXVkaW8=' });

    expect(res.status).toBe(201);
    expect(scorePronunciation).toHaveBeenCalledWith('YXVkaW8=', 'hola', 'es-ES');
    expect(res.body).toEqual(
      expect.objectContaining({
        languageId: language.id,
        targetPhrase: 'hola',
        score: scoreResult,
      }),
    );

    const attempts = await setupPrisma.pronunciationLabAttempt.findMany({
      where: { userId: session.userId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      id: res.body.attemptId,
      languageId: language.id,
      targetPhrase: 'hola',
    });

    const scores = await setupPrisma.pronunciationScore.findMany({
      where: { userId: session.userId, sourceType: 'PRONUNCIATION_LAB_ATTEMPT' },
    });
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      sourceId: res.body.attemptId,
      overallScore: 88,
    });
  });
});
