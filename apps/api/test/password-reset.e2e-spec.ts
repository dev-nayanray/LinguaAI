import { createHash, randomBytes, randomUUID } from 'node:crypto';

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
  type RegisteredSession,
} from './helpers/auth-flow.js';

/** Mirrors `AuthService`'s own (unexported) `hashToken` — a plain SHA-256 hex digest, the same pattern `RefreshToken.tokenHash`/`PasswordResetToken.tokenHash` both already use. */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Integration tests against real Postgres — `/v1/auth/password-reset/*`
 * (E2-T19). Both of T19's own required test classes live here:
 * enumeration-resistance (identical response shapes regardless of account
 * existence, SECURITY.md §6) and session-revocation-on-reset (Part 6:
 * "revokes all existing sessions on success"). Several `confirm` scenarios
 * seed a `PasswordResetToken` row directly rather than going through
 * `request` first — no email-delivery channel exists yet (see
 * `auth.service.ts`'s `requestPasswordReset` doc comment), so the raw token
 * is never observable via HTTP; seeding it directly (same technique other
 * e2e suites already use for fixtures, e.g. `organizations.e2e-spec.ts`'s
 * direct `passwordHash: null` member creation) is the correct way to test
 * `confirm`'s own logic in isolation from that gap.
 */
describe('Password reset (e2e)', () => {
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
    await setupPrisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.oAuthAccount.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    await app.close();
  });

  async function freshSession(): Promise<RegisteredSession> {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  async function freshOAuthOnlyUser(): Promise<{ userId: string; email: string }> {
    const email = uniqueTestEmail();
    const user = await setupPrisma.user.create({
      data: {
        email,
        passwordHash: null,
        displayName: 'OAuth User',
        locale: 'en-US',
        timezone: 'UTC',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);
    await setupPrisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: randomUUID() },
    });
    return { userId: user.id, email };
  }

  async function seedResetToken(
    userId: string,
    overrides: { expiresAt?: Date; usedAt?: Date | null } = {},
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');
    await setupPrisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
        usedAt: overrides.usedAt ?? null,
      },
    });
    return rawToken;
  }

  describe('POST /v1/auth/password-reset/request — enumeration resistance (E2-T19 required test class)', () => {
    it('rejects a malformed email with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('returns 200 EMAIL_SENT for an email with no matching account at all, and creates no PasswordResetToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: uniqueTestEmail() });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'EMAIL_SENT' });
    });

    it('returns the byte-identical 200 EMAIL_SENT response for a real password account — the actual enumeration-resistance property under test', async () => {
      const session = await freshSession();

      const noAccountRes = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: uniqueTestEmail() });
      const realAccountRes = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: session.email });

      expect(realAccountRes.status).toBe(noAccountRes.status);
      expect(realAccountRes.body).toEqual(noAccountRes.body);
      expect(realAccountRes.body).toEqual({ status: 'EMAIL_SENT' });
    });

    it('creates exactly one single-use PasswordResetToken, 1 hour from issuance, for a real password account', async () => {
      const session = await freshSession();

      await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: session.email });

      const rows = await setupPrisma.passwordResetToken.findMany({
        where: { userId: session.userId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.usedAt).toBeNull();
      const hoursUntilExpiry =
        ((rows[0]?.expiresAt.getTime() ?? 0) - Date.now()) / (60 * 60 * 1000);
      expect(hoursUntilExpiry).toBeGreaterThan(0.9);
      expect(hoursUntilExpiry).toBeLessThan(1.1);
    });

    it("returns OAUTH_ACCOUNT with the linked provider for an OAuth-only account — the one deliberate, narrower exception to enumeration resistance (Part 6's own 'never a dead end' requirement)", async () => {
      const { email, userId } = await freshOAuthOnlyUser();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'OAUTH_ACCOUNT', providers: ['GOOGLE'] });
      const rows = await setupPrisma.passwordResetToken.findMany({ where: { userId } });
      expect(rows).toHaveLength(0);
    });
  });

  describe('POST /v1/auth/password-reset/confirm', () => {
    it('rejects a request body with too-short a password with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token: 'x', newPassword: 'short' });
      expect(res.status).toBe(400);
    });

    it('returns 401 for an unknown token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token: 'not-a-real-token', newPassword: 'brand new password 123' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for an expired token, and does not change the password', async () => {
      const session = await freshSession();
      const rawToken = await seedResetToken(session.userId, {
        expiresAt: new Date(Date.now() - 1000),
      });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'brand new password 123' });
      expect(res.status).toBe(401);

      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: session.email, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);
    });

    it('returns 401 for an already-used token', async () => {
      const session = await freshSession();
      const rawToken = await seedResetToken(session.userId, { usedAt: new Date() });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'brand new password 123' });
      expect(res.status).toBe(401);
    });

    it('rejects reusing the same token a second time (single-use)', async () => {
      const session = await freshSession();
      const rawToken = await seedResetToken(session.userId);

      const first = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'brand new password 123' });
      expect(first.status).toBe(204);

      const second = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'yet another password 456' });
      expect(second.status).toBe(401);
    });

    it(
      'happy path + session-revocation-on-reset (E2-T19 required test class): changes the password, ' +
        'and revokes every existing session — the pre-reset access token is rejected, and the pre-reset refresh cookie can no longer mint a new one',
      async () => {
        const session = await freshSession();

        // A second login creates a second, independent Session/RefreshToken
        // pair for the same user — "revokes all existing sessions" (Part 6)
        // must reach both, not just the one active at reset time.
        const secondLoginRes = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: session.email, password: TEST_PASSWORD });
        const secondRefreshToken = extractRefreshToken(secondLoginRes);

        // tokensValidAfter's staleness check compares second-truncated
        // timestamps (Part 8, AuthService.isTokenStale) — a bump landing in
        // the same wall-clock second as the tokens' own `iat` wouldn't
        // register as stale yet. Same precedent as auth.e2e-spec.ts's own
        // "JWT staleness" test class.
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const rawResetToken = await seedResetToken(session.userId);
        const newPassword = 'brand new password 123';

        const confirmRes = await request(app.getHttpServer())
          .post('/v1/auth/password-reset/confirm')
          .send({ token: rawResetToken, newPassword });
        expect(confirmRes.status).toBe(204);

        // Old password no longer works; new one does.
        const oldPasswordLogin = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: session.email, password: TEST_PASSWORD });
        expect(oldPasswordLogin.status).toBe(401);
        const newPasswordLogin = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: session.email, password: newPassword });
        expect(newPasswordLogin.status).toBe(200);

        // The pre-reset access token (from the original freshSession login)
        // is now stale (tokensValidAfter bump, Part 8).
        const staleAccessRes = await request(app.getHttpServer())
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${session.accessToken}`);
        expect(staleAccessRes.status).toBe(401);

        // Neither pre-reset refresh cookie can mint a new access token —
        // both underlying RefreshToken/Session rows were revoked.
        const staleRefreshRes1 = await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', `refreshToken=${session.refreshToken}`);
        expect(staleRefreshRes1.status).toBe(401);
        const staleRefreshRes2 = await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', `refreshToken=${secondRefreshToken}`);
        expect(staleRefreshRes2.status).toBe(401);
      },
      10_000,
    );
  });
});
