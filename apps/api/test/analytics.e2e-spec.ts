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
 * Real integration tests against live Postgres (E17 T2, design doc §5).
 * `AnalyticsService` runs pure aggregate queries over already-real
 * `ProficiencyLevelHistory`/`AIUsageLog` data (E6/E5 T9) — this suite
 * seeds real rows and asserts the reported figures match, not a mocked
 * substitute.
 */
describe('AnalyticsController (e2e)', () => {
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
    // Belt-and-suspenders — the overview test's own inline cleanup covers
    // the ordinary path; this catches anything left behind by an early
    // test failure.
    await setupPrisma.entitlement.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.learningEvent.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.aIUsageLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.proficiencyLevelHistory.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await setupPrisma.proficiencyLevel.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.language.deleteMany({ where: { id: { in: createdLanguageIds } } });
    await setupPrisma.$disconnect();
    await app.close();
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  async function freshLanguage(): Promise<string> {
    const language = await setupPrisma.language.create({
      data: { code: `e17-t2-${randomUUID().slice(0, 8)}`, name: 'E17 T2 Test Language' },
    });
    createdLanguageIds.push(language.id);
    return language.id;
  }

  /** Mirrors course.e2e-spec.ts's own established helper. */
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

  it('rejects an unauthenticated GET with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/analytics/cefr-progression');
    expect(res.status).toBe(401);
  });

  it('rejects a plain USER (non-ADMIN) with 403', async () => {
    const learner = await freshSession();
    const languageId = await freshLanguage();

    const res = await request(app.getHttpServer())
      .get(`/v1/admin/analytics/cefr-progression?languageId=${languageId}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('GET cefr-progression reports a real cohort advancement rate over seeded ProficiencyLevelHistory rows', async () => {
    const admin = await freshAdminSession();
    const languageId = await freshLanguage();

    const learnerA = await freshSession();
    const learnerB = await freshSession();

    const learners: [string, ['A1', 'B1'] | ['A2', 'A2']][] = [
      [learnerA.userId, ['A1', 'B1']],
      [learnerB.userId, ['A2', 'A2']],
    ];
    for (const [userId, levels] of learners) {
      const [, latestLevel] = levels;
      const proficiencyLevel = await setupPrisma.proficiencyLevel.create({
        data: {
          userId,
          languageId,
          skill: 'READING',
          cefrLevel: latestLevel,
          confidence: 0.8,
          source: 'ASSESSMENT',
        },
      });
      for (const [index, cefrLevel] of levels.entries()) {
        await setupPrisma.proficiencyLevelHistory.create({
          data: {
            proficiencyLevelId: proficiencyLevel.id,
            userId,
            languageId,
            skill: 'READING',
            cefrLevel,
            confidence: 0.8,
            source: 'ASSESSMENT',
            recordedAt: new Date(Date.UTC(2026, 0, index + 1)),
          },
        });
      }
    }

    const res = await request(app.getHttpServer())
      .get(`/v1/admin/analytics/cefr-progression?languageId=${languageId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const reading = (
      res.body.bySkill as {
        skill: string;
        usersWithMultipleRecords: number;
        usersAdvanced: number;
        progressionRate: number | null;
      }[]
    ).find((s) => s.skill === 'READING');
    expect(reading).toEqual({
      skill: 'READING',
      usersWithMultipleRecords: 2,
      usersAdvanced: 1,
      progressionRate: 0.5,
    });
  });

  it('GET ai-cost reports real totals and per-dimension breakdowns over seeded AIUsageLog rows', async () => {
    const admin = await freshAdminSession();
    const learner = await freshSession();

    await setupPrisma.aIUsageLog.create({
      data: {
        userId: learner.userId,
        agentPersona: 'CONVERSATION_PARTNER',
        modelId: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        costUsdMicros: 1_000_000,
        latencyMs: 500,
      },
    });
    await setupPrisma.aIUsageLog.create({
      data: {
        userId: learner.userId,
        agentPersona: 'GRAMMAR_COACH',
        modelId: 'gpt-4o-mini',
        inputTokens: 50,
        outputTokens: 20,
        costUsdMicros: 200_000,
        latencyMs: 300,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/admin/analytics/ai-cost')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalCostUsdMicros).toBeGreaterThanOrEqual(1_200_000);
    expect(res.body.totalRequests).toBeGreaterThanOrEqual(2);
    const byPersona = res.body.byAgentPersona as { key: string; costUsdMicros: number }[];
    expect(
      byPersona.find((p) => p.key === 'CONVERSATION_PARTNER')?.costUsdMicros,
    ).toBeGreaterThanOrEqual(1_000_000);
  });

  it('rejects a malformed cefr-progression query (missing languageId) with 400', async () => {
    const admin = await freshAdminSession();

    const res = await request(app.getHttpServer())
      .get('/v1/admin/analytics/cefr-progression')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(400);
  });

  describe('GET overview', () => {
    // A fixed, far-past window, isolated from every other test in this
    // suite's own real-time `freshSession()` registrations — a cohort
    // query scoped to "now" would otherwise sweep in every other test's
    // own users, making an exact-count assertion meaningless.
    const cohortFrom = new Date('2020-01-01T00:00:00.000Z');
    const cohortTo = new Date('2020-01-02T00:00:00.000Z');

    /** Registers a real user, then backdates `createdAt` into this describe block's own isolated cohort window. */
    async function freshCohortUser(withinWindowOffsetMs: number): Promise<RegisteredSession> {
      const session = await freshSession();
      await setupPrisma.user.update({
        where: { id: session.userId },
        data: { createdAt: new Date(cohortFrom.getTime() + withinWindowOffsetMs) },
      });
      return session;
    }

    it('reports real activation/retention/conversion/AI-cost figures over a controlled, isolated signup cohort', async () => {
      const admin = await freshAdminSession();

      // u1: activated (both real events within 24h) + returns on D1 + converts to Premium.
      const u1 = await freshCohortUser(0);
      // u2: not activated (only one of the two required event types), never returns, stays FREE.
      const u2 = await freshCohortUser(60 * 60 * 1000);

      await setupPrisma.learningEvent.createMany({
        data: [
          {
            eventId: randomUUID(),
            type: 'assessment.attempt.completed',
            version: 1,
            occurredAt: new Date(cohortFrom.getTime() + 2 * 60 * 60 * 1000),
            producedBy: 'apps/api',
            userId: u1.userId,
            payload: {},
          },
          {
            eventId: randomUUID(),
            type: 'learning.lesson.completed',
            version: 1,
            occurredAt: new Date(cohortFrom.getTime() + 5 * 60 * 60 * 1000),
            producedBy: 'apps/api',
            userId: u1.userId,
            payload: {},
          },
          // u1's own D1 return — exactly one calendar day after signup.
          {
            eventId: randomUUID(),
            type: 'learning.exercise.answered',
            version: 1,
            occurredAt: new Date(cohortFrom.getTime() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
            producedBy: 'apps/api',
            userId: u1.userId,
            payload: {},
          },
          {
            eventId: randomUUID(),
            type: 'assessment.attempt.completed',
            version: 1,
            occurredAt: new Date(cohortFrom.getTime() + 2 * 60 * 60 * 1000),
            producedBy: 'apps/api',
            userId: u2.userId,
            payload: {},
          },
        ],
      });

      const premiumPlan = await setupPrisma.plan.upsert({
        where: { tier: 'PREMIUM' },
        create: { tier: 'PREMIUM', name: 'Premium', limits: {}, isActive: true },
        update: {},
      });
      await setupPrisma.entitlement.create({
        data: { userId: u1.userId, planId: premiumPlan.id, limits: {}, usage: {} },
      });

      const res = await request(app.getHttpServer())
        .get(
          `/v1/admin/analytics/overview?from=${cohortFrom.toISOString()}&to=${cohortTo.toISOString()}`,
        )
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.activation).toEqual({ cohortSize: 2, count: 1, rate: 0.5 });
      expect(res.body.retention.d1).toEqual({ cohortSize: 2, count: 1, rate: 0.5 });
      expect(res.body.conversion).toEqual({ cohortSize: 2, count: 1, rate: 0.5 });

      await setupPrisma.entitlement.delete({ where: { userId: u1.userId } });
      await setupPrisma.learningEvent.deleteMany({
        where: { userId: { in: [u1.userId, u2.userId] } },
      });
    });

    it('defaults to the last 30 days when from/to are omitted', async () => {
      const admin = await freshAdminSession();

      const res = await request(app.getHttpServer())
        .get('/v1/admin/analytics/overview')
        .set('Authorization', `Bearer ${admin.accessToken}`);

      expect(res.status).toBe(200);
      const to = new Date(res.body.to as string).getTime();
      const from = new Date(res.body.from as string).getTime();
      expect(to - from).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });
});
