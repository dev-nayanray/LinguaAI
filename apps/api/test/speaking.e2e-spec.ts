import { randomUUID } from 'node:crypto';

import { NotFoundException, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import { verifySpeechSessionToken } from '@linguaai/utils';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AiEngineClientService } from '../src/modules/ai-engine/ai-engine-client.service.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E10 T2, design doc §6.2).
 * `AiEngineClientService` is stubbed entirely — mirroring
 * `assessment.e2e-spec.ts`/`vocabulary-content-authoring.e2e-spec.ts`'s own
 * established "mock the boundary, not the system under test" discipline:
 * `startSession`/`endSession` are real HTTP calls to a separately-deployed
 * `services/ai-engine` process this test environment doesn't run. What this
 * suite verifies for real: `SpeakingController`'s own auth/validation, that
 * `SpeakingService` mints a genuinely verifiable token (real
 * `signSpeechSessionToken`, not stubbed), and that the caller's own
 * `userId` — never a client-suppliable value — is what gets forwarded for
 * ai-engine's own ownership check to enforce.
 */
describe('SpeakingController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdLanguageIds: string[] = [];
  const startSession = jest.fn();
  const endSession = jest.fn();
  const scoreFluencyAndExtractVocabulary = jest.fn().mockResolvedValue({
    languageId: '00000000-0000-0000-0000-000000000000',
    fluencyScore: null,
    extractedVocabulary: [],
  });
  const aiEngineClientStub: Pick<
    AiEngineClientService,
    'startSession' | 'endSession' | 'scoreFluencyAndExtractVocabulary'
  > = {
    startSession,
    endSession,
    scoreFluencyAndExtractVocabulary,
  };
  const sessionTokenSecret = process.env.SPEECH_SESSION_TOKEN_SECRET;
  if (!sessionTokenSecret) {
    throw new Error('SPEECH_SESSION_TOKEN_SECRET must be set to run this e2e suite');
  }

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
    startSession.mockReset();
    endSession.mockReset();
    scoreFluencyAndExtractVocabulary.mockReset();
    scoreFluencyAndExtractVocabulary.mockResolvedValue({
      languageId: '00000000-0000-0000-0000-000000000000',
      fluencyScore: null,
      extractedVocabulary: [],
    });
  });

  afterAll(async () => {
    await setupPrisma.personalDictionary.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.language.deleteMany({ where: { id: { in: createdLanguageIds } } });
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

  /** Mirrors vocabulary.e2e-spec.ts's own established helper. */
  async function freshLanguage(): Promise<string> {
    const language = await setupPrisma.language.create({
      data: { code: `e2e-${randomUUID().slice(0, 8)}`, name: 'E2E Test Language' },
    });
    createdLanguageIds.push(language.id);
    return language.id;
  }

  describe('POST /v1/speaking-sessions', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/speaking-sessions')
        .send({ languageId: randomUUID() });
      expect(res.status).toBe(401);
      expect(startSession).not.toHaveBeenCalled();
    });

    it('rejects a malformed body (missing languageId) with 400', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/speaking-sessions')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(startSession).not.toHaveBeenCalled();
    });

    it('starts a real AIAgentSession as CONVERSATION_PARTNER, never client-suppliable, and returns a real, verifiable token', async () => {
      const session = await freshSession();
      const languageId = randomUUID();
      const sessionId = randomUUID();
      startSession.mockResolvedValue({ sessionId });

      const res = await request(app.getHttpServer())
        .post('/v1/speaking-sessions')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, orchestratorAgent: 'VOCABULARY_COACH' });

      expect(res.status).toBe(201);
      expect(startSession).toHaveBeenCalledWith({
        userId: session.userId,
        languageId,
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });
      expect(res.body).toEqual({
        sessionId,
        token: expect.any(String),
        expiresInSeconds: 60,
      });

      const verification = verifySpeechSessionToken(res.body.token, sessionTokenSecret, sessionId);
      expect(verification).toEqual({
        valid: true,
        claims: { sessionId, userId: session.userId },
      });
    });
  });

  describe('DELETE /v1/speaking-sessions/:id', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/v1/speaking-sessions/${randomUUID()}`,
      );
      expect(res.status).toBe(401);
      expect(endSession).not.toHaveBeenCalled();
    });

    it('forwards the caller own userId (never a client-suppliable value) so ai-engine can enforce ownership', async () => {
      const session = await freshSession();
      endSession.mockResolvedValue(undefined);
      const sessionId = randomUUID();

      const res = await request(app.getHttpServer())
        .delete(`/v1/speaking-sessions/${sessionId}`)
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(res.status).toBe(204);
      expect(endSession).toHaveBeenCalledWith(sessionId, session.userId);
    });

    it('propagates a 404 when the underlying session is missing or not owned by the caller', async () => {
      const session = await freshSession();
      endSession.mockRejectedValue(new NotFoundException('Speaking session not found'));
      const sessionId = randomUUID();

      const res = await request(app.getHttpServer())
        .delete(`/v1/speaking-sessions/${sessionId}`)
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('saves real PersonalDictionary rows (source CONVERSATION) for vocabulary ai-engine extracted (E10 T5)', async () => {
      const session = await freshSession();
      endSession.mockResolvedValue(undefined);
      const languageId = await freshLanguage();
      const sessionId = randomUUID();
      scoreFluencyAndExtractVocabulary.mockResolvedValue({
        languageId,
        fluencyScore: {
          overallScore: 78,
          componentScores: { fluency: 80, coherence: 75, pronunciation: 70, grammar: 85 },
          feedback: 'Solid effort.',
        },
        extractedVocabulary: [
          { term: 'hola', translation: 'hello', notes: undefined },
          { term: 'gracias', translation: undefined, notes: 'polite expression' },
        ],
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/speaking-sessions/${sessionId}`)
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(res.status).toBe(204);
      expect(scoreFluencyAndExtractVocabulary).toHaveBeenCalledWith(sessionId);

      const savedEntries = await setupPrisma.personalDictionary.findMany({
        where: { userId: session.userId, languageId },
        orderBy: { term: 'asc' },
      });
      expect(savedEntries).toHaveLength(2);
      expect(savedEntries[0]).toMatchObject({
        term: 'gracias',
        translation: null,
        notes: 'polite expression',
        source: 'CONVERSATION',
      });
      expect(savedEntries[1]).toMatchObject({
        term: 'hola',
        translation: 'hello',
        notes: null,
        source: 'CONVERSATION',
      });
    });
  });
});
