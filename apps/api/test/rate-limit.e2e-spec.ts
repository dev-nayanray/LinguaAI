import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import {
  registerAndLogin,
  TEST_PASSWORD,
  uniqueTestEmail,
  validRegisterBody,
} from './helpers/auth-flow.js';

/**
 * Integration tests against real Postgres + real Redis — E2-T21's own two
 * required test classes. Both exercise the by-*identifier* counter
 * specifically (email for login/password-reset, userId for mfa/verify) —
 * `auth-rate-limits.ts`'s own doc comment explains why the by-*IP* counter
 * is deliberately set far above what a real HTTP round trip through this
 * (fast-growing) e2e suite can drive in one run, and why that's the
 * correct choice, not an untested gap: the by-IP path's own logic is fully
 * covered by `rate-limit.guard.spec.ts`'s unit tests (which mock the
 * counter directly and don't depend on real request volume), and every
 * other e2e suite in this codebase already exercises the "allowed" side of
 * the by-IP counter implicitly, thousands of times over, just by existing.
 *
 * The Redis-outage fail-closed test class (Part 11) is deliberately **not**
 * duplicated here against real infra — deterministically taking the shared
 * dev/CI Redis instance down mid-suite would affect every other
 * concurrently-running e2e test that depends on it (domain events, this
 * suite's own IP counter). `rate-limit.guard.spec.ts`'s two fail-closed
 * unit tests (mocking `RateLimiter.consume` to throw) are the actual proof
 * of that behavior — the same mock-vs-real-infra split already established
 * in E2-T20's own testing-scope decision.
 */
describe('Rate limiting (e2e)', () => {
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
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    await app.close();
  });

  describe('POST /v1/auth/login — scripted brute-force (E2-T21 required test class)', () => {
    it('allows up to 5 attempts against one target email within the window, then rejects the 6th with 429 — a scripted credential-guessing attempt against a single account', async () => {
      // Registers directly (not via the registerAndLogin helper, which
      // performs its own login internally and would consume 1 of the 5
      // identifier-counter slots before this test's own loop even starts).
      const email = uniqueTestEmail();
      const registerRes = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(validRegisterBody(email));
      createdUserIds.push(registerRes.body.id as string);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email, password: 'definitely-wrong' });
        expect(res.status).toBe(401);
      }

      const sixthAttempt = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'definitely-wrong' });
      expect(sixthAttempt.status).toBe(429);

      // Even the *correct* password is now rejected — the limiter blocks
      // before credential verification ever runs, exactly as intended.
      const correctPasswordAttempt = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: TEST_PASSWORD });
      expect(correctPasswordAttempt.status).toBe(429);
    }, 15_000);

    it('does not block a different target email from the same IP — the by-identifier counter is scoped per email, not a blanket IP-wide lock at this threshold', async () => {
      const attackedEmail = uniqueTestEmail();
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: attackedEmail, password: 'wrong' });
      }
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: attackedEmail, password: 'wrong' }); // 6th — now blocked

      const session = await registerAndLogin(app); // a genuinely different, freshly-registered account
      createdUserIds.push(session.userId);
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: session.email, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
    }, 15_000);
  });

  describe('POST /v1/auth/password-reset/request — scripted brute-force', () => {
    it('allows up to 3 requests for one target email within the window, then rejects the 4th with 429', async () => {
      const email = uniqueTestEmail();

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/password-reset/request')
          .send({ email });
        expect(res.status).toBe(200);
      }

      const fourthAttempt = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email });
      expect(fourthAttempt.status).toBe(429);
    }, 15_000);
  });

  // No standalone brute-force proof for `/v1/auth/mfa/verify` here, by
  // deliberate choice, not oversight: `MFA_VERIFY_RATE_LIMIT`'s
  // by-identifier threshold (10) is set *above* `MfaService`'s own
  // DB-backed lockout (5 failures → 403, E2-T13) specifically so the DB
  // lockout — more specific, already tested, with its own meaningful 403
  // signal — remains the primary defense for this endpoint (see
  // `auth-rate-limits.ts`'s doc comment for the empirically-discovered
  // reason). That means a wrong-code brute-force loop against this route
  // always hits the DB lockout's 403 at attempt 6, long before this Redis
  // counter's own threshold could ever be demonstrated the same way
  // login's/password-reset's tests do above — `mfa.e2e-spec.ts`'s own
  // pre-existing lockout test (E2-T13) is the real proof this endpoint's
  // brute-force defense still works correctly with `RateLimitGuard`
  // layered in front of it. The underlying `RateLimitGuard`/`RateLimiter`
  // mechanism itself — including a custom `extractIdentifier` reading
  // `req.user.userId` rather than a request body field — is already fully
  // proven: once for real infra above (login), and generically at the unit
  // level (`rate-limit.guard.spec.ts`).
});
