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
 * Real integration tests against live Postgres (E9 T1, §6.1). Evidence
 * bar: an ADMIN can author a `VocabularyItem`, update it, and soft-delete
 * it; every authenticated user (not just ADMIN) can browse/search the
 * catalog; a soft-deleted item is excluded from both the list and the
 * single-item read, never served (API_GUIDELINES.md §3's no-existence-leak
 * rule, matching `CourseHierarchyService`'s own established discipline).
 */
describe('VocabularyModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdLanguageIds: string[] = [];
  const createdVocabularyItemIds: string[] = [];
  const createdPersonalDictionaryIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    if (createdPersonalDictionaryIds.length > 0) {
      await setupPrisma.personalDictionary.deleteMany({
        where: { id: { in: createdPersonalDictionaryIds } },
      });
    }
    if (createdVocabularyItemIds.length > 0) {
      await setupPrisma.vocabularyItem.deleteMany({
        where: { id: { in: createdVocabularyItemIds } },
      });
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

  describe('POST /v1/admin/vocabulary-items', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const languageId = await freshLanguage();
      const res = await request(app.getHttpServer())
        .post('/v1/admin/vocabulary-items')
        .send({
          languageId,
          term: 'hola',
          partOfSpeech: 'INTERJECTION',
          translations: { en: 'hello' },
        });
      expect(res.status).toBe(401);
    });

    it('rejects a plain USER (non-ADMIN) with 403', async () => {
      const session = await freshSession();
      const languageId = await freshLanguage();
      const res = await request(app.getHttpServer())
        .post('/v1/admin/vocabulary-items')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          languageId,
          term: 'hola',
          partOfSpeech: 'INTERJECTION',
          translations: { en: 'hello' },
        });
      expect(res.status).toBe(403);
    });

    it('returns 400 for a malformed request body (no translations)', async () => {
      const admin = await freshAdminSession();
      const languageId = await freshLanguage();
      const res = await request(app.getHttpServer())
        .post('/v1/admin/vocabulary-items')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ languageId, term: 'hola', partOfSpeech: 'INTERJECTION', translations: {} });
      expect(res.status).toBe(400);
    });

    it('an ADMIN creates a VocabularyItem', async () => {
      const admin = await freshAdminSession();
      const languageId = await freshLanguage();

      const res = await request(app.getHttpServer())
        .post('/v1/admin/vocabulary-items')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          languageId,
          term: 'hola',
          partOfSpeech: 'INTERJECTION',
          translations: { en: 'hello' },
          exampleSentences: [{ sentence: '¡Hola, amigo!', translation: 'Hello, friend!' }],
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        languageId,
        term: 'hola',
        partOfSpeech: 'INTERJECTION',
        translations: { en: 'hello' },
      });
      createdVocabularyItemIds.push(res.body.id);
    });
  });

  describe('Full author -> update -> browse -> delete flow', () => {
    it('an ADMIN can author, update, browse (as any user), and soft-delete a VocabularyItem, which then 404s and is excluded from the catalog', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();

      const createRes = await request(app.getHttpServer())
        .post('/v1/admin/vocabulary-items')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          languageId,
          term: 'gato',
          partOfSpeech: 'NOUN',
          translations: { en: 'cat' },
        });
      expect(createRes.status).toBe(201);
      const itemId = createRes.body.id as string;
      createdVocabularyItemIds.push(itemId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/v1/admin/vocabulary-items/${itemId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ translations: { en: 'cat', fr: 'chat' } });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.translations).toEqual({ en: 'cat', fr: 'chat' });

      // Any authenticated user (not just ADMIN) can browse the catalog.
      const listRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary-items?languageId=${languageId}&search=gat`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.map((i: { id: string }) => i.id)).toContain(itemId);

      const getRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary-items/${itemId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.term).toBe('gato');

      const deleteRes = await request(app.getHttpServer())
        .delete(`/v1/admin/vocabulary-items/${itemId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(deleteRes.status).toBe(204);

      // Soft-deleted: never served again, by id or in the list.
      const getAfterDeleteRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary-items/${itemId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(getAfterDeleteRes.status).toBe(404);

      const listAfterDeleteRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary-items?languageId=${languageId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(listAfterDeleteRes.body.data.map((i: { id: string }) => i.id)).not.toContain(itemId);
    });
  });

  describe('POST /v1/vocabulary/personal-dictionary', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const languageId = await freshLanguage();
      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .send({ languageId, term: 'perro', source: 'MANUAL' });
      expect(res.status).toBe(401);
    });

    it('saves a freeform term with no vocabularyItemId link', async () => {
      const learner = await freshSession();
      const languageId = await freshLanguage();

      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ languageId, term: 'perro', translation: 'dog', source: 'CAMERA_TRANSLATION' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        userId: learner.userId,
        languageId,
        term: 'perro',
        translation: 'dog',
        source: 'CAMERA_TRANSLATION',
        vocabularyItemId: null,
      });
      createdPersonalDictionaryIds.push(res.body.id);
    });

    it('returns 404 when the supplied vocabularyItemId does not reference a real catalog item, and creates nothing', async () => {
      const learner = await freshSession();
      const languageId = await freshLanguage();

      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({
          languageId,
          term: 'perro',
          source: 'MANUAL',
          vocabularyItemId: randomUUID(),
        });

      expect(res.status).toBe(404);

      const listRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary/personal-dictionary?languageId=${languageId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(listRes.body.data).toHaveLength(0);
    });

    it('links to a real catalog VocabularyItem when a valid vocabularyItemId is supplied', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();

      const catalogRes = await request(app.getHttpServer())
        .post('/v1/admin/vocabulary-items')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ languageId, term: 'perro', partOfSpeech: 'NOUN', translations: { en: 'dog' } });
      const vocabularyItemId = catalogRes.body.id as string;
      createdVocabularyItemIds.push(vocabularyItemId);

      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ languageId, term: 'perro', source: 'CONVERSATION', vocabularyItemId });

      expect(res.status).toBe(201);
      expect(res.body.vocabularyItemId).toBe(vocabularyItemId);
      createdPersonalDictionaryIds.push(res.body.id);
    });
  });

  describe('GET /v1/vocabulary/personal-dictionary', () => {
    it("only ever lists the caller's own entries, cursor-paginated, filterable by languageId", async () => {
      const owner = await freshSession();
      const otherUser = await freshSession();
      const languageId = await freshLanguage();
      const otherLanguageId = await freshLanguage();

      const terms = ['uno', 'dos', 'tres'];
      for (const term of terms) {
        const res = await request(app.getHttpServer())
          .post('/v1/vocabulary/personal-dictionary')
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ languageId, term, source: 'MANUAL' });
        createdPersonalDictionaryIds.push(res.body.id);
      }
      // A different-language entry for the same owner -- excluded by the languageId filter.
      const otherLangRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ languageId: otherLanguageId, term: 'quattro', source: 'MANUAL' });
      createdPersonalDictionaryIds.push(otherLangRes.body.id);
      // A different owner's entry for the same language -- never visible to `owner`.
      const otherUserRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${otherUser.accessToken}`)
        .send({ languageId, term: 'cinco', source: 'MANUAL' });
      createdPersonalDictionaryIds.push(otherUserRes.body.id);

      const firstPage = await request(app.getHttpServer())
        .get(`/v1/vocabulary/personal-dictionary?languageId=${languageId}&limit=2`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data).toHaveLength(2);
      expect(firstPage.body.meta.nextCursor).not.toBeNull();
      expect(firstPage.body.data.every((e: { term: string }) => terms.includes(e.term))).toBe(true);

      const secondPage = await request(app.getHttpServer())
        .get(
          `/v1/vocabulary/personal-dictionary?languageId=${languageId}&limit=2&cursor=${firstPage.body.meta.nextCursor}`,
        )
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data).toHaveLength(1);
      expect(secondPage.body.meta.nextCursor).toBeNull();

      const allTermsSeen = [...firstPage.body.data, ...secondPage.body.data].map(
        (e: { term: string }) => e.term,
      );
      expect(allTermsSeen.sort()).toEqual([...terms].sort());
    });
  });

  describe('DELETE /v1/vocabulary/personal-dictionary/:id', () => {
    it("removes the caller's own entry, which then no longer appears in the list", async () => {
      const learner = await freshSession();
      const languageId = await freshLanguage();

      const createRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ languageId, term: 'seis', source: 'MANUAL' });
      const entryId = createRes.body.id as string;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/v1/vocabulary/personal-dictionary/${entryId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(deleteRes.status).toBe(204);

      const listRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary/personal-dictionary?languageId=${languageId}`)
        .set('Authorization', `Bearer ${learner.accessToken}`);
      expect(listRes.body.data.map((e: { id: string }) => e.id)).not.toContain(entryId);
    });

    it("returns 404 (not 403) for another user's entry, never leaking its existence", async () => {
      const owner = await freshSession();
      const otherUser = await freshSession();
      const languageId = await freshLanguage();

      const createRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/personal-dictionary')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ languageId, term: 'siete', source: 'MANUAL' });
      const entryId = createRes.body.id as string;
      createdPersonalDictionaryIds.push(entryId);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/v1/vocabulary/personal-dictionary/${entryId}`)
        .set('Authorization', `Bearer ${otherUser.accessToken}`);
      expect(deleteRes.status).toBe(404);

      // Still there -- the cross-user delete attempt never touched it.
      const listRes = await request(app.getHttpServer())
        .get(`/v1/vocabulary/personal-dictionary?languageId=${languageId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(listRes.body.data.map((e: { id: string }) => e.id)).toContain(entryId);
    });
  });
});
