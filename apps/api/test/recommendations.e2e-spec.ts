import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E7 T5, §6.6) — same
 * discipline as `assessment.e2e-spec.ts`. `LearningPlan`/`DailyGoal` rows
 * are seeded directly via Prisma (the same rows `recommendation-engine`'s
 * own generation jobs, E7 T2/T3, would have produced) rather than driving
 * the full assessment/generation pipeline end-to-end — this suite's own
 * scope is the read contract, not re-proving T2/T3's own generation logic.
 */
describe('RecommendationsModule (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  const createdLanguageIds: string[] = [];

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
    await setupPrisma.dailyGoal.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.learningPlan.deleteMany({ where: { userId: { in: createdUserIds } } });
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

  describe('GET /v1/learning-plans/current', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/learning-plans/current');
      expect(res.status).toBe(401);
    });

    it('returns 404 when the caller has no active LearningPlan', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .get('/v1/learning-plans/current')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(404);
    });

    it("returns the caller's own active plan, never another user's", async () => {
      const session = await freshSession();
      const outsider = await freshSession();
      const languageId = await freshLanguage();
      const plan = await setupPrisma.learningPlan.create({
        data: {
          userId: session.userId,
          languageId,
          goal: 'Conversational fluency',
          milestones: { version: 1 },
          isActive: true,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/learning-plans/current')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(plan.id);
      expect(res.body.userId).toBe(session.userId);
      expect(res.body.languageId).toBe(languageId);
      expect(res.body.goal).toBe('Conversational fluency');
      expect(res.body.isActive).toBe(true);

      const outsiderRes = await request(app.getHttpServer())
        .get('/v1/learning-plans/current')
        .set('Authorization', `Bearer ${outsider.accessToken}`);
      expect(outsiderRes.status).toBe(404);
    });

    it('ignores an inactive plan (404), even though a row exists', async () => {
      const session = await freshSession();
      const languageId = await freshLanguage();
      await setupPrisma.learningPlan.create({
        data: {
          userId: session.userId,
          languageId,
          goal: 'Conversational fluency',
          milestones: {},
          isActive: false,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/learning-plans/current')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('resolves a specific language via ?languageId for a multi-language learner', async () => {
      const session = await freshSession();
      const spanishId = await freshLanguage();
      const frenchId = await freshLanguage();
      const spanishPlan = await setupPrisma.learningPlan.create({
        data: {
          userId: session.userId,
          languageId: spanishId,
          goal: 'Spanish',
          milestones: {},
          isActive: true,
        },
      });
      const frenchPlan = await setupPrisma.learningPlan.create({
        data: {
          userId: session.userId,
          languageId: frenchId,
          goal: 'French',
          milestones: {},
          isActive: true,
        },
      });

      const spanishRes = await request(app.getHttpServer())
        .get(`/v1/learning-plans/current?languageId=${spanishId}`)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(spanishRes.status).toBe(200);
      expect(spanishRes.body.id).toBe(spanishPlan.id);

      const frenchRes = await request(app.getHttpServer())
        .get(`/v1/learning-plans/current?languageId=${frenchId}`)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(frenchRes.status).toBe(200);
      expect(frenchRes.body.id).toBe(frenchPlan.id);

      // No languageId given — falls back to the most-recently-updated
      // active plan (the French one, created last).
      const defaultRes = await request(app.getHttpServer())
        .get('/v1/learning-plans/current')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(defaultRes.status).toBe(200);
      expect(defaultRes.body.id).toBe(frenchPlan.id);
    });
  });

  describe('GET /v1/daily-goals/today', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/daily-goals/today');
      expect(res.status).toBe(401);
    });

    it('returns 404 when no DailyGoal has been generated for today yet', async () => {
      const session = await freshSession();
      const res = await request(app.getHttpServer())
        .get('/v1/daily-goals/today')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(404);
    });

    it("returns the caller's own DailyGoal for today, resolved via the caller's own local timezone", async () => {
      const session = await freshSession();
      // `registerAndLogin`'s default is UTC (auth-flow.ts) — override to a
      // real non-UTC zone so this test actually exercises timezone-correct
      // resolution, not a UTC-only coincidence.
      await setupPrisma.user.update({
        where: { id: session.userId },
        data: { timezone: 'America/Los_Angeles' },
      });

      // "Today" in Los Angeles right now, computed the same way the
      // service under test computes it — this test fixture intentionally
      // does not hardcode a specific date, so it stays correct regardless
      // of what day it's actually run on.
      const todayInLosAngeles = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      const goal = await setupPrisma.dailyGoal.create({
        data: {
          userId: session.userId,
          date: new Date(`${todayInLosAngeles}T00:00:00.000Z`),
          targetXp: 50,
          targetMinutes: 15,
          targetActivities: 3,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/daily-goals/today')
        .set('Authorization', `Bearer ${session.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(goal.id);
      expect(res.body.userId).toBe(session.userId);
      expect(res.body.date).toBe(todayInLosAngeles);
      expect(res.body.targetXp).toBe(50);
      expect(res.body.completed).toBe(false);
    });

    it("never returns another user's DailyGoal", async () => {
      const session = await freshSession();
      const outsider = await freshSession();
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      await setupPrisma.dailyGoal.create({
        data: {
          userId: session.userId,
          date: new Date(`${today}T00:00:00.000Z`),
          targetXp: 50,
          targetMinutes: 15,
          targetActivities: 3,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/daily-goals/today')
        .set('Authorization', `Bearer ${outsider.accessToken}`);
      expect(res.status).toBe(404);
    });
  });
});
