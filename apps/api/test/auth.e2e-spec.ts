import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { LOGGER } from '@linguaai/observability/nestjs';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

function extractRefreshToken(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const refreshCookie = cookies?.find((c) => c.startsWith('refreshToken='));
  if (!refreshCookie) {
    throw new Error('No refreshToken cookie in response');
  }
  // "refreshToken=<value>; Path=/; ..." — value only, up to the first ';'.
  const value = refreshCookie.split(';')[0]?.split('=')[1];
  if (!value) {
    throw new Error('Malformed refreshToken cookie');
  }
  return value;
}

/**
 * Integration tests against the real dev Postgres instance (docker-compose),
 * through the app's real `app_role`/`app_service_role` connections — never
 * mocked, matching this Epic's established discipline that RLS/privilege
 * behavior can only be proven against a real database. Requires the dev
 * stack to be running (`docker compose up -d`) and `.env` populated
 * (`test:e2e:api` loads it via `dotenv-cli`).
 */
describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  // Cleanup-only connection (superuser) — never used by the app itself,
  // only to remove this spec's own test fixtures afterward.
  const cleanupPrisma = getPrismaClient();
  const createdEmails: string[] = [];

  function uniqueEmail(): string {
    const email = `e2e-auth-${randomUUID()}@test.local`;
    createdEmails.push(email);
    return email;
  }

  const validRegisterBody = (email: string) => ({
    email,
    password: 'correct horse battery staple',
    displayName: 'E2E Test User',
    locale: 'en-US',
    timezone: 'UTC',
    tosAccepted: true,
    privacyPolicyAccepted: true,
  });

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
    await cleanupPrisma.consentRecord.deleteMany({
      where: { user: { email: { in: createdEmails } } },
    });
    await cleanupPrisma.refreshToken.deleteMany({
      where: { user: { email: { in: createdEmails } } },
    });
    await cleanupPrisma.session.deleteMany({ where: { user: { email: { in: createdEmails } } } });
    await cleanupPrisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await cleanupPrisma.$disconnect();
    await app.close();
  });

  describe('POST /v1/auth/register', () => {
    it('happy path: creates an ACTIVE user and never returns passwordHash/mfaSecret', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(validRegisterBody(email));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        email,
        displayName: 'E2E Test User',
        role: 'USER',
        status: 'ACTIVE',
        mfaEnrolled: false,
      });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('mfaSecret');
      expect(res.body).not.toHaveProperty('tokensValidAfter');

      const consents = await cleanupPrisma.consentRecord.findMany({
        where: { userId: res.body.id as string },
      });
      expect(consents.map((c) => c.consentType).sort()).toEqual(['PRIVACY_POLICY', 'TOS']);
    });

    it('validation failure: rejects an unaccepted ToS with 400', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ ...validRegisterBody(email), tosAccepted: false });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validation failure: rejects a password under 12 characters with 400', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ ...validRegisterBody(email), password: 'short' });

      expect(res.status).toBe(400);
    });

    it('validation failure: rejects a malformed email with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ ...validRegisterBody('not-an-email'), email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('duplicate email returns 409 CONFLICT', async () => {
      const email = uniqueEmail();
      const first = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(validRegisterBody(email));
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(validRegisterBody(email));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /v1/auth/login', () => {
    it('happy path: returns an access token, public user, and sets the refresh-token cookie', async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer()).post('/v1/auth/register').send(validRegisterBody(email));

      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct horse battery staple' });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toMatchObject({ email });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
      const refreshCookie = cookies?.find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toMatch(/HttpOnly/i);
      expect(refreshCookie).toMatch(/SameSite=Strict/i);
    });

    it('wrong password returns 401', async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer()).post('/v1/auth/register').send(validRegisterBody(email));

      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'the wrong password entirely' });

      expect(res.status).toBe(401);
    });

    it('unknown email returns 401 (same shape as a wrong password, not a distinct not-found)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: `nonexistent-${randomUUID()}@test.local`,
          password: 'anything at all here',
        });

      expect(res.status).toBe(401);
    });

    it('X-Client-Platform: mobile returns the refresh token in the JSON body and sets no cookie (E21 T1, no cookie jar)', async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer()).post('/v1/auth/register').send(validRegisterBody(email));

      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .set('X-Client-Platform', 'mobile')
        .send({ email, password: 'correct horse battery staple' });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('POST /v1/auth/refresh', () => {
    async function registerAndLogin(): Promise<{ email: string; refreshToken: string }> {
      const email = uniqueEmail();
      await request(app.getHttpServer()).post('/v1/auth/register').send(validRegisterBody(email));
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct horse battery staple' });
      return { email, refreshToken: extractRefreshToken(loginRes) };
    }

    it('happy path: rotates the refresh token and returns a new access token', async () => {
      const { refreshToken } = await registerAndLogin();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      const newRefreshToken = extractRefreshToken(res);
      expect(newRefreshToken).not.toBe(refreshToken);
    });

    it('rejects a missing refresh-token cookie with 401', async () => {
      const res = await request(app.getHttpServer()).post('/v1/auth/refresh');
      expect(res.status).toBe(401);
    });

    it('rejects an unknown refresh token with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', 'refreshToken=not-a-real-token');
      expect(res.status).toBe(401);
    });

    it('the already-rotated (old) token can never be used again after a successful rotation', async () => {
      const { refreshToken } = await registerAndLogin();
      const first = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`);
      expect(first.status).toBe(200);

      const reuse = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`);
      expect(reuse.status).toBe(401);
    });

    it('race: two concurrent rotations of the same token — exactly one succeeds, and the loser fully revokes the session', async () => {
      const { email, refreshToken } = await registerAndLogin();

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', `refreshToken=${refreshToken}`),
        request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', `refreshToken=${refreshToken}`),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 401]);

      // Whichever request "won" the atomic claim, Part 8 treats the loser's
      // zero-rows-updated outcome as reuse — the entire session (including
      // the token the winner just minted) is revoked as a result.
      const user = await cleanupPrisma.user.findUniqueOrThrow({ where: { email } });
      const sessions = await cleanupPrisma.session.findMany({ where: { userId: user.id } });
      expect(sessions).toHaveLength(1);
      const [session] = sessions;
      expect(session?.revokedAt).not.toBeNull();

      const winner = resA.status === 200 ? resA : resB;
      const postRaceAttempt = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', `refreshToken=${extractRefreshToken(winner)}`);
      expect(postRaceAttempt.status).toBe(401);
    });

    it('a body-supplied refresh token (mobile, E21 T1, no cookie jar) rotates and returns the new token in the body', async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer()).post('/v1/auth/register').send(validRegisterBody(email));
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .set('X-Client-Platform', 'mobile')
        .send({ email, password: 'correct horse battery staple' });
      const refreshToken = loginRes.body.refreshToken as string;

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.refreshToken).not.toBe(refreshToken);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('JWT staleness (AuthService.isTokenStale, direct integration)', () => {
    // No route in this Epic guards on the JWT yet (T10+ is the first real
    // consumer of JwtStrategy) — this integration test proves the actual
    // staleness-check query against real Postgres directly through the
    // wired AuthService instance, rather than a full HTTP round-trip
    // through a protected route that doesn't exist yet.
    it('a token issued before tokensValidAfter is bumped is rejected as stale', async () => {
      const email = uniqueEmail();
      const registerRes = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(validRegisterBody(email));
      const userId = registerRes.body.id as string;
      const authService = app.get(AuthService);

      const beforeBump = Math.floor(Date.now() / 1000);
      expect(await authService.isTokenStale(userId, beforeBump)).toBe(false);

      // Simulate what a role/org-membership change does (Part 5): bump
      // tokensValidAfter forward.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await cleanupPrisma.user.update({
        where: { id: userId },
        data: { tokensValidAfter: new Date() },
      });

      expect(await authService.isTokenStale(userId, beforeBump)).toBe(true);

      const afterBump = Math.floor(Date.now() / 1000) + 1;
      expect(await authService.isTokenStale(userId, afterBump)).toBe(false);
    }, 10_000);

    it('fails closed (stale) for a user id that does not exist', async () => {
      const authService = app.get(AuthService);
      await expect(authService.isTokenStale(randomUUID(), 0)).resolves.toBe(true);
    });
  });

  describe('credential hygiene', () => {
    it('never logs the plaintext password or the resulting Argon2id hash across register+login', async () => {
      const logger = app.get(LOGGER) as {
        info: jest.Mock;
        error: jest.Mock;
        warn: jest.Mock;
        debug: jest.Mock;
      };
      const infoSpy = jest.spyOn(logger, 'info');
      const errorSpy = jest.spyOn(logger, 'error');

      const email = uniqueEmail();
      const password = 'a very specific plaintext password 123';
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ ...validRegisterBody(email), password });
      await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password });

      const allLoggedArgs = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
      expect(allLoggedArgs).not.toContain(password);
      expect(allLoggedArgs).not.toContain('$argon2id$');

      infoSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
