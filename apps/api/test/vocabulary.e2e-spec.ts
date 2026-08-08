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
  const createdUserVocabularyIds: string[] = [];

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
    if (createdUserVocabularyIds.length > 0) {
      await setupPrisma.userVocabulary.deleteMany({
        where: { id: { in: createdUserVocabularyIds } },
      });
    }
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

  /** Authors a real, non-deleted catalog VocabularyItem for the SRS deck tests to add. */
  async function authorVocabularyItem(
    admin: RegisteredSession,
    languageId: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/admin/vocabulary-items')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ languageId, term: 'ocho', partOfSpeech: 'OTHER', translations: { en: 'eight' } });
    createdVocabularyItemIds.push(res.body.id);
    return res.body.id as string;
  }

  describe('POST /v1/vocabulary/deck', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .send({ vocabularyItemId: randomUUID() });
      expect(res.status).toBe(401);
    });

    it('adds a real catalog item to the deck at SM-2 defaults', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();
      const vocabularyItemId = await authorVocabularyItem(admin, languageId);

      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        userId: learner.userId,
        vocabularyItemId,
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        lastReviewedAt: null,
      });
      createdUserVocabularyIds.push(res.body.id);
    });

    it('is idempotent -- adding the same item twice returns the same row, not a duplicate', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();
      const vocabularyItemId = await authorVocabularyItem(admin, languageId);

      const first = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId });
      createdUserVocabularyIds.push(first.body.id);

      const second = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId });

      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);

      const count = await setupPrisma.userVocabulary.count({
        where: { userId: learner.userId, vocabularyItemId },
      });
      expect(count).toBe(1);
    });

    it('returns 404 for an invalid vocabularyItemId, and creates nothing', async () => {
      const learner = await freshSession();

      const res = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId: randomUUID() });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/vocabulary/deck/due', () => {
    it('only lists cards actually due (nextReviewAt <= now), excluding a card scheduled in the future', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();
      const dueItemId = await authorVocabularyItem(admin, languageId);
      const notDueItemId = await authorVocabularyItem(admin, languageId);

      const dueRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId: dueItemId });
      createdUserVocabularyIds.push(dueRes.body.id);

      const notDueRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId: notDueItemId });
      createdUserVocabularyIds.push(notDueRes.body.id);
      // Push this one's own next review ten days into the future -- directly
      // via Prisma, since the API itself has no way to schedule a card
      // early (only a real review submission ever changes `nextReviewAt`).
      await setupPrisma.userVocabulary.update({
        where: { id: notDueRes.body.id },
        data: { nextReviewAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/vocabulary/deck/due')
        .set('Authorization', `Bearer ${learner.accessToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((e: { id: string }) => e.id);
      expect(ids).toContain(dueRes.body.id);
      expect(ids).not.toContain(notDueRes.body.id);
    });
  });

  describe('POST /v1/vocabulary/deck/:id/reviews', () => {
    it('applies the SM-2 transition and persists it -- a first successful review reaches repetitions=1, intervalDays=1', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();
      const vocabularyItemId = await authorVocabularyItem(admin, languageId);

      const addRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId });
      const deckEntryId = addRes.body.id as string;
      createdUserVocabularyIds.push(deckEntryId);

      const reviewRes = await request(app.getHttpServer())
        .post(`/v1/vocabulary/deck/${deckEntryId}/reviews`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ quality: 4 });

      expect(reviewRes.status).toBe(201);
      expect(reviewRes.body.repetitions).toBe(1);
      expect(reviewRes.body.intervalDays).toBe(1);
      expect(reviewRes.body.lastReviewedAt).not.toBeNull();
      expect(new Date(reviewRes.body.nextReviewAt).getTime()).toBeGreaterThan(Date.now());

      // A subsequent failed review (quality < 3) resets progress back to 0/1.
      const failedReviewRes = await request(app.getHttpServer())
        .post(`/v1/vocabulary/deck/${deckEntryId}/reviews`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ quality: 1 });
      expect(failedReviewRes.status).toBe(201);
      expect(failedReviewRes.body.repetitions).toBe(0);
      expect(failedReviewRes.body.intervalDays).toBe(1);
    });

    it('returns 400 for an out-of-range quality', async () => {
      const admin = await freshAdminSession();
      const learner = await freshSession();
      const languageId = await freshLanguage();
      const vocabularyItemId = await authorVocabularyItem(admin, languageId);
      const addRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ vocabularyItemId });
      createdUserVocabularyIds.push(addRes.body.id);

      const res = await request(app.getHttpServer())
        .post(`/v1/vocabulary/deck/${addRes.body.id}/reviews`)
        .set('Authorization', `Bearer ${learner.accessToken}`)
        .send({ quality: 6 });
      expect(res.status).toBe(400);
    });

    it("returns 404 (not 403) for another user's deck entry, never leaking its existence", async () => {
      const admin = await freshAdminSession();
      const owner = await freshSession();
      const otherUser = await freshSession();
      const languageId = await freshLanguage();
      const vocabularyItemId = await authorVocabularyItem(admin, languageId);

      const addRes = await request(app.getHttpServer())
        .post('/v1/vocabulary/deck')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ vocabularyItemId });
      const deckEntryId = addRes.body.id as string;
      createdUserVocabularyIds.push(deckEntryId);

      const res = await request(app.getHttpServer())
        .post(`/v1/vocabulary/deck/${deckEntryId}/reviews`)
        .set('Authorization', `Bearer ${otherUser.accessToken}`)
        .send({ quality: 4 });
      expect(res.status).toBe(404);
    });
  });
});
