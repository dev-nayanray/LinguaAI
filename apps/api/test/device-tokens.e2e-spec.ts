import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { registerAndLogin, type RegisteredSession } from './helpers/auth-flow.js';

/**
 * Real integration tests against live Postgres (E21 T4, design doc §5).
 * `token` is a real `DeviceToken.token @unique` (this task's own
 * migration), so registration is a real upsert, not just a create.
 */
describe('DeviceTokensController (e2e)', () => {
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
    await setupPrisma.notificationLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.deviceToken.deleteMany({ where: { userId: { in: createdUserIds } } });
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

  it('rejects an unauthenticated POST with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .send({ platform: 'ANDROID', token: randomUUID() });
    expect(res.status).toBe(401);
  });

  it('registers a real DeviceToken row for a genuinely new token', async () => {
    const learner = await freshSession();
    const token = randomUUID();

    const res = await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ platform: 'ANDROID', token });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: learner.userId,
      platform: 'ANDROID',
      token,
      active: true,
    });

    const row = await setupPrisma.deviceToken.findUnique({ where: { token } });
    expect(row?.userId).toBe(learner.userId);
  });

  it('re-registering an already-known token reassigns it to the new caller (shared device / account switch)', async () => {
    const first = await freshSession();
    const second = await freshSession();
    const token = randomUUID();

    await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ platform: 'IOS', token });

    const res = await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ platform: 'IOS', token });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(second.userId);

    const rows = await setupPrisma.deviceToken.findMany({ where: { token } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(second.userId);
  });

  it('rejects an unauthenticated DELETE with 401', async () => {
    const res = await request(app.getHttpServer()).delete(
      `/v1/notifications/device-tokens/${randomUUID()}`,
    );
    expect(res.status).toBe(401);
  });

  it("deletes the caller's own real token", async () => {
    const learner = await freshSession();
    const token = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ platform: 'ANDROID', token });

    const res = await request(app.getHttpServer())
      .delete(`/v1/notifications/device-tokens/${token}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(204);
    const row = await setupPrisma.deviceToken.findUnique({ where: { token } });
    expect(row).toBeNull();
  });

  it('404s on deleting an unknown token', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .delete(`/v1/notifications/device-tokens/${randomUUID()}`)
      .set('Authorization', `Bearer ${learner.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("404s (not 403) when attempting to delete another caller's real token — enumeration-resistant", async () => {
    const owner = await freshSession();
    const intruder = await freshSession();
    const token = randomUUID();
    await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ platform: 'ANDROID', token });

    const res = await request(app.getHttpServer())
      .delete(`/v1/notifications/device-tokens/${token}`)
      .set('Authorization', `Bearer ${intruder.accessToken}`);

    expect(res.status).toBe(404);
    const row = await setupPrisma.deviceToken.findUnique({ where: { token } });
    expect(row).not.toBeNull();
  });

  it('rejects a malformed POST body with 400', async () => {
    const learner = await freshSession();

    const res = await request(app.getHttpServer())
      .post('/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${learner.accessToken}`)
      .send({ platform: 'WINDOWS_PHONE', token: 'x' });

    expect(res.status).toBe(400);
  });
});
