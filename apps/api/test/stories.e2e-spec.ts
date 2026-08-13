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
 * Real integration tests against live Postgres (E13 T3, design doc §6.3).
 * `AiEngineClientService` is stubbed entirely — mirroring
 * `writing-submissions.e2e-spec.ts`'s own established "mock the boundary,
 * not the system under test" discipline: `draftStory` is a real HTTP call
 * to a separately-deployed `services/ai-engine` process this test
 * environment doesn't run. What this suite verifies for real:
 * `StoryController`'s own auth/validation, that the caller's own real,
 * already-saved `PersonalDictionary` terms are queried and forwarded, and
 * a real persisted `GeneratedStory` row.
 */
describe('StoryController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const draftStory = jest.fn();
  const aiEngineClientStub: Pick<AiEngineClientService, 'draftStory'> = { draftStory };

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
    draftStory.mockReset();
  });

  afterAll(async () => {
    await setupPrisma.generatedStory.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.personalDictionary.deleteMany({ where: { userId: { in: createdUserIds } } });
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
      .post('/v1/stories')
      .send({ languageId: randomUUID() });

    expect(res.status).toBe(401);
    expect(draftStory).not.toHaveBeenCalled();
  });

  it('404s on a language that does not exist, never calling ai-engine', async () => {
    const session = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/stories')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: randomUUID() });

    expect(res.status).toBe(404);
    expect(draftStory).not.toHaveBeenCalled();
  });

  it('rejects (400) a learner with no saved vocabulary yet, never calling ai-engine', async () => {
    const session = await freshSession();
    const language = await setupPrisma.language.findUniqueOrThrow({ where: { code: 'es' } });

    const res = await request(app.getHttpServer())
      .post('/v1/stories')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ languageId: language.id });

    expect(res.status).toBe(400);
    expect(draftStory).not.toHaveBeenCalled();
  });

  it("generates a story reusing the caller's own saved vocabulary, and persists a real GeneratedStory row", async () => {
    const session = await freshSession();
    const language = await setupPrisma.language.findUniqueOrThrow({ where: { code: 'es' } });
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${session.accessToken}`);

    await auth(request(app.getHttpServer()).post('/v1/vocabulary/personal-dictionary')).send({
      languageId: language.id,
      term: 'perro',
      source: 'MANUAL',
    });
    await auth(request(app.getHttpServer()).post('/v1/vocabulary/personal-dictionary')).send({
      languageId: language.id,
      term: 'gato',
      source: 'MANUAL',
    });

    const storyDraft = {
      title: 'Un Día con Mi Perro',
      storyText: 'Tengo un perro y un gato.',
      vocabularyUsed: ['perro', 'gato'],
    };
    draftStory.mockResolvedValue(storyDraft);

    const res = await auth(request(app.getHttpServer()).post('/v1/stories')).send({
      languageId: language.id,
    });

    expect(res.status).toBe(201);
    expect(draftStory).toHaveBeenCalledWith({
      languageId: language.id,
      targetLanguageName: language.name,
      cefrLevel: 'A1',
      vocabularyTerms: ['gato', 'perro'],
    });
    expect(res.body).toEqual(
      expect.objectContaining({
        languageId: language.id,
        title: storyDraft.title,
        storyText: storyDraft.storyText,
        vocabularyUsed: storyDraft.vocabularyUsed,
      }),
    );

    const stories = await setupPrisma.generatedStory.findMany({
      where: { userId: session.userId },
    });
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({
      id: res.body.storyId,
      languageId: language.id,
      title: storyDraft.title,
      vocabularyUsed: storyDraft.vocabularyUsed,
    });
  });
});
