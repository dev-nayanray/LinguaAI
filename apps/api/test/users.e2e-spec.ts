import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import {
  extractRefreshToken,
  registerAndLogin,
  TEST_PASSWORD,
  uniqueTestEmail,
  validRegisterBody,
  type RegisteredSession,
} from './helpers/auth-flow.js';

/**
 * Integration tests against the real dev Postgres instance — same
 * discipline as auth.e2e-spec.ts. Session/RefreshToken carry no RLS
 * (E2-T4's policy matrix covers only User/Organization/OrganizationMembership),
 * so these endpoints' correctness rests entirely on the explicit `userId`
 * ownership checks this suite verifies.
 */
describe('UsersModule (e2e)', () => {
  let app: INestApplication;
  const cleanupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

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
    await cleanupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await cleanupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await cleanupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await cleanupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await cleanupPrisma.$disconnect();
    await app.close();
  });

  describe('GET /v1/users/me/sessions', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/users/me/sessions');
      expect(res.status).toBe(401);
    });

    it("lists the caller's own active session, never someone else's", async () => {
      const mine = await freshSession();
      const someoneElse = await freshSession();

      const res = await request(app.getHttpServer())
        .get('/v1/users/me/sessions')
        .set('Authorization', `Bearer ${mine.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as { id: string; userId: string }[]).map((s) => s.id);
      expect(ids.length).toBeGreaterThan(0);
      for (const returnedSession of res.body as { userId: string }[]) {
        expect(returnedSession.userId).toBe(mine.userId);
        expect(returnedSession.userId).not.toBe(someoneElse.userId);
      }
    });
  });

  describe('DELETE /v1/users/me/sessions/:id', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/v1/users/me/sessions/11111111-1111-1111-1111-111111111111',
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 for a malformed (non-UUID) session id', async () => {
      const { accessToken } = await freshSession();
      const res = await request(app.getHttpServer())
        .delete('/v1/users/me/sessions/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when the session belongs to a different user (no existence leak)', async () => {
      const owner = await freshSession();
      const attacker = await freshSession();

      const listRes = await request(app.getHttpServer())
        .get('/v1/users/me/sessions')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const ownerSessionId = (listRes.body as { id: string }[])[0]?.id;
      expect(ownerSessionId).toBeDefined();

      const res = await request(app.getHttpServer())
        .delete(`/v1/users/me/sessions/${ownerSessionId}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`);
      expect(res.status).toBe(404);
    });

    it(
      "happy path: revokes the caller's own session (marked revoked in the database, so it would disappear from a " +
        "still-authenticated caller's list) and its refresh token stops working. Listing again with the very access " +
        'token that owned the now-revoked session is covered separately below (E2-T28: that token stops working ' +
        'immediately, so it can no longer be used to list anything at all).',
      async () => {
        const session = await freshSession();

        const listRes = await request(app.getHttpServer())
          .get('/v1/users/me/sessions')
          .set('Authorization', `Bearer ${session.accessToken}`);
        const sessionId = (listRes.body as { id: string }[])[0]?.id;
        expect(sessionId).toBeDefined();

        const deleteRes = await request(app.getHttpServer())
          .delete(`/v1/users/me/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${session.accessToken}`);
        expect(deleteRes.status).toBe(204);

        const revokedSession = await cleanupPrisma.session.findUnique({ where: { id: sessionId } });
        expect(revokedSession?.revokedAt).not.toBeNull();

        const refreshAfter = await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', `refreshToken=${session.refreshToken}`);
        expect(refreshAfter.status).toBe(401);
      },
    );

    it(
      'E2-T28 remediation: the still-live access token stops working immediately after revocation — not just at its own ' +
        'natural 15-minute expiry (SECURITY.md §2: "session revocation is immediate and server-enforced")',
      async () => {
        const session = await freshSession();
        const listRes = await request(app.getHttpServer())
          .get('/v1/users/me/sessions')
          .set('Authorization', `Bearer ${session.accessToken}`);
        const sessionId = (listRes.body as { id: string }[])[0]?.id;
        expect(sessionId).toBeDefined();

        const deleteRes = await request(app.getHttpServer())
          .delete(`/v1/users/me/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${session.accessToken}`);
        expect(deleteRes.status).toBe(204);

        // Same, still-cryptographically-valid access token, immediately reused.
        const immediatelyAfter = await request(app.getHttpServer())
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${session.accessToken}`);
        expect(immediatelyAfter.status).toBe(401);
      },
    );
  });

  describe('POST /v1/auth/logout', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/v1/auth/logout');
      expect(res.status).toBe(401);
    });

    it('rejects a Bearer-authenticated request with no refresh-token cookie', async () => {
      const { accessToken } = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(401);
    });

    it('happy path: revokes the current session and clears the refresh cookie; the old refresh token then fails', async () => {
      const session = await freshSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', `refreshToken=${session.refreshToken}`);

      expect(res.status).toBe(204);
      const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
      const clearedCookie = cookies?.find((c) => c.startsWith('refreshToken='));
      expect(clearedCookie).toMatch(/refreshToken=;/);

      const refreshAfter = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', `refreshToken=${session.refreshToken}`);
      expect(refreshAfter.status).toBe(401);
    });

    it("cannot log out using a refresh-token cookie that belongs to a different user's session", async () => {
      const victim = await freshSession();
      const attacker = await freshSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .set('Cookie', `refreshToken=${victim.refreshToken}`);

      expect(res.status).toBe(401);

      // Prove the victim's session survived the attempt.
      const stillWorks = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', `refreshToken=${victim.refreshToken}`);
      expect(stillWorks.status).toBe(200);
    });

    it(
      'E2-T28 remediation: the still-live access token stops working immediately after logout — not just at its own ' +
        'natural 15-minute expiry (SECURITY.md §2: "session revocation is immediate and server-enforced")',
      async () => {
        const session = await freshSession();

        const logoutRes = await request(app.getHttpServer())
          .post('/v1/auth/logout')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .set('Cookie', `refreshToken=${session.refreshToken}`);
        expect(logoutRes.status).toBe(204);

        // Same, still-cryptographically-valid access token, immediately reused.
        const immediatelyAfter = await request(app.getHttpServer())
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${session.accessToken}`);
        expect(immediatelyAfter.status).toBe(401);
      },
    );

    it(
      "E2-T28 remediation, negative example: logging out one device's session does not invalidate a different, still-active " +
        "session's access token for the same user — this is exactly why the fix is a per-session jti denylist and not a " +
        "per-user tokensValidAfter bump (Part 8's own stated reason a jti denylist exists at all)",
      async () => {
        const email = uniqueTestEmail();
        const registerRes = await request(app.getHttpServer())
          .post('/v1/auth/register')
          .send(validRegisterBody(email));
        createdUserIds.push(registerRes.body.id as string);

        const firstDeviceRes = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email, password: TEST_PASSWORD });
        const firstDeviceSession = {
          accessToken: firstDeviceRes.body.accessToken as string,
          refreshToken: extractRefreshToken(firstDeviceRes),
        };
        const secondDeviceRes = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email, password: TEST_PASSWORD });
        const secondDeviceAccessToken = secondDeviceRes.body.accessToken as string;

        await request(app.getHttpServer())
          .post('/v1/auth/logout')
          .set('Authorization', `Bearer ${firstDeviceSession.accessToken}`)
          .set('Cookie', `refreshToken=${firstDeviceSession.refreshToken}`);

        const secondDeviceStillWorks = await request(app.getHttpServer())
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${secondDeviceAccessToken}`);
        expect(secondDeviceStillWorks.status).toBe(200);
      },
    );
  });
});
