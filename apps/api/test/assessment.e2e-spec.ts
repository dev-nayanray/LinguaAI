import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient, type AssessmentItem, type Skill } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Integration tests against real Postgres (E6 T2) — same discipline as
 * `organizations.e2e-spec.ts`. Uses its own dedicated `Language` and
 * `AssessmentItem` fixtures (not the global `seed.ts` Spanish content) so
 * this suite is self-contained and order-independent — one item per
 * objective skill keeps full-attempt-completion flows fast and
 * deterministic (mirrors `assessment.service.spec.ts`'s own unit-test
 * fixture shape).
 */
describe('AssessmentModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  let languageId: string;
  let items: Record<Skill, AssessmentItem>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();

    const language = await setupPrisma.language.create({
      data: { code: `e2e-${randomUUID().slice(0, 8)}`, name: 'E2E Test Language' },
    });
    languageId = language.id;

    const skills: Skill[] = ['READING', 'LISTENING', 'VOCABULARY', 'GRAMMAR'];
    const created = await Promise.all(
      skills.map((skill) =>
        setupPrisma.assessmentItem.create({
          data: {
            languageId,
            skill,
            cefrLevel: 'B1',
            difficulty: 0.5,
            prompt: `${skill} prompt`,
            correctAnswer: { correctIndex: 1 },
            itemType: 'MULTIPLE_CHOICE',
          },
        }),
      ),
    );
    items = Object.fromEntries(skills.map((skill, i) => [skill, created[i]])) as Record<
      Skill,
      AssessmentItem
    >;
  });

  afterAll(async () => {
    // `languageId` is only assigned once `beforeAll` reaches its own
    // fixture-creation step — if `app.init()`/module compilation itself
    // throws (e.g. a missing required env var), `afterAll` still runs with
    // `languageId` unset. Guarding here avoids a confusing secondary
    // Prisma validation error masking the real, original failure.
    if (languageId) {
      await setupPrisma.proficiencyLevelHistory.deleteMany({ where: { languageId } });
      await setupPrisma.proficiencyLevel.deleteMany({ where: { languageId } });
      await setupPrisma.assessmentResponse.deleteMany({ where: { item: { languageId } } });
      await setupPrisma.assessmentAttempt.deleteMany({ where: { languageId } });
      await setupPrisma.assessmentItem.deleteMany({ where: { languageId } });
    }
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (languageId) {
      await setupPrisma.language.delete({ where: { id: languageId } });
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

  describe('POST /v1/assessment-attempts', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .send({ languageId, type: 'PLACEMENT' });
      expect(res.status).toBe(401);
    });

    it('returns 404 for a language that does not exist', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId: randomUUID(), type: 'PLACEMENT' });
      expect(res.status).toBe(404);
    });

    it('happy path: creates an IN_PROGRESS attempt and serves the first item, never leaking correctAnswer', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });

      expect(res.status).toBe(201);
      expect(res.body.attempt.status).toBe('IN_PROGRESS');
      expect(res.body.attempt.userId).toBe(session.userId);
      expect(res.body.nextItem.skill).toBe('READING');
      expect(res.body.nextItem.correctAnswer).toBeUndefined();
    });
  });

  describe('full attempt lifecycle: start -> answer every objective skill -> complete', () => {
    it('walks Reading/Listening/Vocabulary/Grammar in order, scores each response, and completes the attempt', async () => {
      const session = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });
      const attemptId = startRes.body.attempt.id as string;
      expect(startRes.body.nextItem.skill).toBe('READING');

      const expectedOrder: Skill[] = ['READING', 'LISTENING', 'VOCABULARY', 'GRAMMAR'];
      let currentItemId = startRes.body.nextItem.id as string;

      for (let i = 0; i < expectedOrder.length; i++) {
        const submitRes = await request(app.getHttpServer())
          .post(`/v1/assessment-attempts/${attemptId}/responses`)
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({ itemId: currentItemId, response: { selectedIndex: 1 } });

        expect(submitRes.status).toBe(201);
        expect(submitRes.body.response.isCorrect).toBe(true);
        expect(submitRes.body.response.score).toBe(1);

        const nextSkill = expectedOrder[i + 1];
        if (nextSkill) {
          expect(submitRes.body.nextItem.skill).toBe(nextSkill);
          currentItemId = submitRes.body.nextItem.id as string;
        } else {
          expect(submitRes.body.nextItem).toBeNull();
        }
      }

      const completeRes = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${attemptId}/complete`)
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.attempt.status).toBe('COMPLETED');
      expect(completeRes.body.attempt.completedAt).not.toBeNull();
      expect(completeRes.body.responses).toHaveLength(4);

      // Every skill served exactly 1 item, answered correctly, at the
      // fixture's default difficulty (0.5) — E6-T3's §6.4 banding: raw
      // score 100% -> C2; confidence 0.5*(1/5) + 0.5*1 = 0.6, above the
      // 0.5 floor, so not flagged lowConfidence.
      expect(completeRes.body.proficiencyLevels).toHaveLength(4);
      for (const result of completeRes.body.proficiencyLevels) {
        expect(result.cefrLevel).toBe('C2');
        expect(result.confidence).toBeCloseTo(0.6, 5);
        expect(result.lowConfidence).toBe(false);
      }

      // Idempotent re-completion (a real, partial mitigation for the
      // Idempotency-Key infrastructure this platform doesn't build yet,
      // RISK_REGISTER.md) — a retried complete call returns the same
      // result, not an error, and does not write a second
      // ProficiencyLevelHistory row for the same completion event.
      const secondCompleteRes = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${attemptId}/complete`)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(secondCompleteRes.status).toBe(200);
      expect(secondCompleteRes.body.attempt.status).toBe('COMPLETED');
      expect(secondCompleteRes.body.proficiencyLevels).toEqual(completeRes.body.proficiencyLevels);

      const historyRows = await setupPrisma.proficiencyLevelHistory.findMany({
        where: { userId: session.userId, languageId },
      });
      expect(historyRows).toHaveLength(4);
    });
  });

  describe('POST /v1/assessment-attempts/:id/responses', () => {
    it('returns 404 for an attempt owned by a different user', async () => {
      const owner = await freshSession();
      const outsider = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });

      const res = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${startRes.body.attempt.id}/responses`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ itemId: startRes.body.nextItem.id, response: { selectedIndex: 1 } });
      expect(res.status).toBe(404);
    });

    it('returns 409 when the submitted item is not the currently active one', async () => {
      const session = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });

      const res = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${startRes.body.attempt.id}/responses`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        // The active item is Reading — submitting the Grammar item's id directly is out of order.
        .send({ itemId: items.GRAMMAR.id, response: { selectedIndex: 1 } });
      expect(res.status).toBe(409);
    });

    it('returns 409 on a duplicate submission for the same item', async () => {
      const session = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });
      const attemptId = startRes.body.attempt.id as string;
      const itemId = startRes.body.nextItem.id as string;

      await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${attemptId}/responses`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ itemId, response: { selectedIndex: 1 } });

      const res = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${attemptId}/responses`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ itemId, response: { selectedIndex: 1 } });
      expect(res.status).toBe(409);
    });

    it('scores an incorrect response correctly', async () => {
      const session = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });

      const res = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${startRes.body.attempt.id}/responses`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ itemId: startRes.body.nextItem.id, response: { selectedIndex: 0 } });

      expect(res.status).toBe(201);
      expect(res.body.response.isCorrect).toBe(false);
      expect(res.body.response.score).toBe(0);
    });
  });

  describe('POST /v1/assessment-attempts/:id/complete', () => {
    it('returns 409 when a skill still has items left to serve', async () => {
      const session = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });

      const res = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${startRes.body.attempt.id}/complete`)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(409);
    });

    it('returns 404 for an attempt owned by a different user', async () => {
      const owner = await freshSession();
      const outsider = await freshSession();
      const startRes = await request(app.getHttpServer())
        .post('/v1/assessment-attempts')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ languageId, type: 'PLACEMENT' });

      const res = await request(app.getHttpServer())
        .post(`/v1/assessment-attempts/${startRes.body.attempt.id}/complete`)
        .set('Authorization', `Bearer ${outsider.accessToken}`);
      expect(res.status).toBe(404);
    });
  });
});
