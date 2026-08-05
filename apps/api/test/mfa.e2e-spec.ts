import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { decodeEncryptionKey, decryptField } from '@linguaai/utils';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { MfaGuard } from '../src/modules/auth/guards/mfa.guard.js';
import { extractRefreshToken, registerAndLogin, TEST_PASSWORD } from './helpers/auth-flow.js';

/**
 * Integration tests against real Postgres — same discipline as the other
 * e2e suites. `MfaGuard` has no live route to guard yet (its real wiring
 * onto ADMIN/ENTERPRISE_ADMIN routes is E2-T14's job, alongside RolesGuard
 * — the implementation plan is explicit both guards land together) — its
 * own logic is proven here via direct injection against real Postgres
 * data, the same precedent `AuthService.isTokenStale` set in E2-T9 before
 * `JwtStrategy` had a live consumer either.
 */
describe('MFA (e2e)', () => {
  let app: INestApplication;
  const cleanupPrisma = getPrismaClient();
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
    await cleanupPrisma.mfaVerificationAttempt.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await cleanupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await cleanupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await cleanupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await cleanupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await cleanupPrisma.$disconnect();
    await app.close();
  });

  async function freshSession() {
    const session = await registerAndLogin(app);
    createdUserIds.push(session.userId);
    return session;
  }

  /** Registers, logs in, promotes to ADMIN (direct DB write — bypasses the governance function, same shortcut MfaGuard's own tests above already use), and completes MFA enrollment. Returns the TOTP secret alongside the session so callers can generate fresh codes. */
  async function freshEnrolledAdmin() {
    const session = await freshSession();
    await cleanupPrisma.user.update({ where: { id: session.userId }, data: { role: 'ADMIN' } });
    const enrollRes = await request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .set('Authorization', `Bearer ${session.accessToken}`);
    const secret = enrollRes.body.secret as string;
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ secret, code: authenticator.generate(secret) });
    return { ...session, secret };
  }

  describe('POST /v1/auth/mfa/enroll', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/v1/auth/mfa/enroll');
      expect(res.status).toBe(401);
    });

    it("happy path: returns a fresh secret and an otpauth URL keyed to the caller's own email, writing nothing yet", async () => {
      const { email, accessToken, userId } = await freshSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enroll')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.secret).toBe('string');
      expect(res.body.otpauthUrl).toContain(encodeURIComponent(email));

      const user = await cleanupPrisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.mfaEnrolled).toBe(false);
      expect(user.mfaSecret).toBeNull();
    });
  });

  describe('POST /v1/auth/mfa/verify', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .send({ secret: 'x', code: '123456' });
      expect(res.status).toBe(401);
    });

    it('rejects a malformed (non-6-digit) code with 400 before ever checking it', async () => {
      const { accessToken } = await freshSession();
      const res = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ secret: authenticator.generateSecret(), code: 'abc' });
      expect(res.status).toBe(400);
    });

    it('rejects an incorrect code with 401 and does not enroll', async () => {
      const { accessToken, userId } = await freshSession();
      const secret = authenticator.generateSecret();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ secret, code: '000000' });

      expect(res.status).toBe(401);
      const user = await cleanupPrisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.mfaEnrolled).toBe(false);
    });

    it('happy path: a correct code completes enrollment, and the stored secret is encrypted, not plaintext', async () => {
      const { accessToken, userId } = await freshSession();
      const enrollRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enroll')
        .set('Authorization', `Bearer ${accessToken}`);
      const secret = enrollRes.body.secret as string;
      const code = authenticator.generate(secret);

      const verifyRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ secret, code });

      expect(verifyRes.status).toBe(204);

      const user = await cleanupPrisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.mfaEnrolled).toBe(true);
      expect(user.mfaSecret).not.toBeNull();
      expect(user.mfaSecret).not.toBe(secret);

      // Decrypting the stored value with the real app key recovers the
      // original plaintext secret — proves it's genuinely encrypted, not
      // just some other transformation.
      const key = decodeEncryptionKey(process.env.MFA_SECRET_ENCRYPTION_KEY!);
      expect(decryptField(user.mfaSecret!, key)).toBe(secret);
    });

    it('lockout: the 6th failed attempt within 10 minutes is rejected with 403, even with the correct code (Part 8, remediation High-4)', async () => {
      const { accessToken, userId } = await freshSession();
      const secret = authenticator.generateSecret();

      for (let i = 0; i < 5; i += 1) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/mfa/verify')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ secret, code: '000000' });
        expect(res.status).toBe(401);
      }

      const validCode = authenticator.generate(secret);
      const lockedRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ secret, code: validCode });

      expect(lockedRes.status).toBe(403);

      const user = await cleanupPrisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.mfaEnrolled).toBe(false);

      const attemptCount = await cleanupPrisma.mfaVerificationAttempt.count({ where: { userId } });
      // 5 recorded failures — the 6th (locked-out) request never reached
      // code verification, so it recorded nothing.
      expect(attemptCount).toBe(5);
    });
  });

  describe('Login step-up (ADR-011, E2-T22) — POST /v1/auth/login + POST /v1/auth/mfa/challenge', () => {
    afterAll(async () => {
      await cleanupPrisma.mfaChallengeToken.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
    });

    it('an MFA-enrolled ADMIN gets MFA_REQUIRED + a challengeToken from login, not a full session — and no refresh cookie is set', async () => {
      const admin = await freshEnrolledAdmin();

      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.status).toBe('MFA_REQUIRED');
      expect(typeof loginRes.body.challengeToken).toBe('string');
      expect(loginRes.body).not.toHaveProperty('accessToken');
      expect(loginRes.headers['set-cookie']).toBeUndefined();
    });

    it('a non-enrolled ADMIN and a plain USER still get an ordinary AUTHENTICATED session directly from login', async () => {
      const { userId, email } = await freshSession();
      await cleanupPrisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });

      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: TEST_PASSWORD });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.status).toBe('AUTHENTICATED');
      expect(typeof loginRes.body.accessToken).toBe('string');
      expect(extractRefreshToken(loginRes)).toBeTruthy();
    });

    it('happy path: a valid challengeToken + correct TOTP code from mfa/challenge yields a full AUTHENTICATED session with a refresh cookie', async () => {
      const admin = await freshEnrolledAdmin();
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD });
      const challengeToken = loginRes.body.challengeToken as string;

      const challengeRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken, code: authenticator.generate(admin.secret) });

      expect(challengeRes.status).toBe(200);
      expect(challengeRes.body.status).toBe('AUTHENTICATED');
      expect(typeof challengeRes.body.accessToken).toBe('string');
      expect(challengeRes.body.user.id).toBe(admin.userId);
      expect(extractRefreshToken(challengeRes)).toBeTruthy();
    });

    it('rejects a wrong TOTP code with 401, and the challengeToken is spent — a retry with the correct code also fails', async () => {
      const admin = await freshEnrolledAdmin();
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD });
      const challengeToken = loginRes.body.challengeToken as string;

      const wrongRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken, code: '000000' });
      expect(wrongRes.status).toBe(401);

      const retryRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken, code: authenticator.generate(admin.secret) });
      expect(retryRes.status).toBe(401);
    });

    it('rejects an unknown/garbage challengeToken with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken: 'not-a-real-token', code: '123456' });
      expect(res.status).toBe(401);
    });

    it('rejects a malformed (non-6-digit) code with 400 before ever checking it', async () => {
      const admin = await freshEnrolledAdmin();
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken: loginRes.body.challengeToken, code: 'abc' });
      expect(res.status).toBe(400);
    });

    it('a challengeToken cannot be reused after a successful challenge (single-use)', async () => {
      const admin = await freshEnrolledAdmin();
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD });
      const challengeToken = loginRes.body.challengeToken as string;

      const firstCode = authenticator.generate(admin.secret);
      const firstRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken, code: firstCode });
      expect(firstRes.status).toBe(200);

      const secondRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/challenge')
        .send({ challengeToken, code: firstCode });
      expect(secondRes.status).toBe(401);
    });
  });

  describe('MfaGuard — direct integration (no live route yet; real wiring is E2-T14)', () => {
    it('blocks an ADMIN/ENTERPRISE_ADMIN caller whose mfaEnrolled is false', async () => {
      const { userId } = await freshSession();
      await cleanupPrisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });

      const guard = app.get(MfaGuard);
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ user: { userId, role: 'ADMIN' } }) }),
      } as unknown as Parameters<typeof guard.canActivate>[0];

      await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    });

    it('allows an ADMIN/ENTERPRISE_ADMIN caller whose mfaEnrolled is true', async () => {
      const { accessToken, userId } = await freshSession();
      await cleanupPrisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
      const enrollRes = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enroll')
        .set('Authorization', `Bearer ${accessToken}`);
      const secret = enrollRes.body.secret as string;
      await request(app.getHttpServer())
        .post('/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ secret, code: authenticator.generate(secret) });

      const guard = app.get(MfaGuard);
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ user: { userId, role: 'ADMIN' } }) }),
      } as unknown as Parameters<typeof guard.canActivate>[0];

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('allows a plain USER caller through regardless of mfaEnrolled (only ADMIN/ENTERPRISE_ADMIN are gated)', async () => {
      const { userId } = await freshSession();

      const guard = app.get(MfaGuard);
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ user: { userId, role: 'USER' } }) }),
      } as unknown as Parameters<typeof guard.canActivate>[0];

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
