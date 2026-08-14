import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E16 T3, design doc §5).
 * `domain-events.e2e-spec.ts` already proves the underlying Redis
 * fan-out mechanism for real (E16 T1) — this suite doesn't repeat that,
 * it proves this endpoint's own HTTP contract, and that a `PUT` genuinely
 * persists the same `NotificationPreference` row `notification-service`'s
 * own `NotificationPreferenceService.isOptedIn()` reads (T2). That a
 * persisted opt-out is actually honored on the next send is already
 * proven end-to-end, against a real running `notification-service`
 * consumer and real MailHog, by T2's own
 * `notification-delivery.e2e-spec.ts` ("suppresses delivery for an
 * opted-out NotificationPreference row") — the same table, the same real
 * mechanism, not re-proven here to avoid two e2e suites redundantly
 * booting two separate services against the same Redis/Postgres.
 */
describe('NotificationPreferencesController (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];

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
    // `NotificationLog` rows can be real here too, not just
    // `NotificationPreference` — registering a real user (`freshSession`)
    // publishes a real `identity.user.registered` event onto this same
    // Redis (E16 T1's fan-out), and if a real `notification-service`
    // consumer happens to be running against it, a real `NotificationLog`
    // row lands for that user — a genuine FK dependency this cleanup must
    // respect, the same as every other referenced table below.
    await setupPrisma.notificationLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.notificationPreference.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
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

  it('rejects an unauthenticated GET with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/notification-preferences');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated PUT with 401', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/notification-preferences')
      .send({ channel: 'EMAIL', type: 'MARKETING', optedIn: false });
    expect(res.status).toBe(401);
  });

  it('GET returns the full default-opted-in set (12 rows) for a fresh user with no real preference rows yet', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    expect((res.body as { optedIn: boolean }[]).every((row) => row.optedIn === true)).toBe(true);
  });

  it('PUT persists a real opt-out row, immediately reflected on the very next GET (no lag)', async () => {
    const learner = await freshSession();

    const putRes = await request(app.getHttpServer())
      .put('/v1/notification-preferences')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ channel: 'EMAIL', type: 'MARKETING', optedIn: false });

    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({ channel: 'EMAIL', type: 'MARKETING', optedIn: false });

    const getRes = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set('Authorization', `Bearer ${learner.accessToken}`);
    const marketing = (getRes.body as { channel: string; type: string; optedIn: boolean }[]).find(
      (row) => row.channel === 'EMAIL' && row.type === 'MARKETING',
    );
    expect(marketing?.optedIn).toBe(false);

    // The exact row notification-service's own NotificationPreferenceService
    // reads (T2) — proves this is a real persisted row, not just an
    // in-memory response.
    const row = await setupPrisma.notificationPreference.findUnique({
      where: {
        userId_channel_type: { userId: learner.userId, channel: 'EMAIL', type: 'MARKETING' },
      },
    });
    expect(row?.optedIn).toBe(false);
  });

  it('rejects a SECURITY_ALERT opt-out attempt with 422 — never silently stored as a meaningless row', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .put('/v1/notification-preferences')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ channel: 'EMAIL', type: 'SECURITY_ALERT', optedIn: false });

    expect(res.status).toBe(422);
    const row = await setupPrisma.notificationPreference.findUnique({
      where: {
        userId_channel_type: { userId: learner.userId, channel: 'EMAIL', type: 'SECURITY_ALERT' },
      },
    });
    expect(row).toBeNull();
  });

  it('rejects a malformed PUT body with 400', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .put('/v1/notification-preferences')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ channel: 'SMS', type: 'MARKETING', optedIn: false });

    expect(res.status).toBe(400);
  });
});
