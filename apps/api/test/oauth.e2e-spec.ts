import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { OAuthService } from '../src/modules/auth/oauth.service.js';

/**
 * Integration tests against real Postgres — same discipline as the other
 * e2e suites. Deliberately never exercises a real Google/Apple network
 * round-trip (no live credentials exist in this environment, confirmed
 * with the user as this task's testing boundary): every scenario here
 * either fails CSRF-`state` validation before Passport's guard ever calls
 * into the provider-exchange step, or exercises `OAuthService`'s
 * account-matching/no-auto-link decision logic directly (matching the
 * precedent set for `AuthService.isTokenStale` in E2-T9).
 */
describe('OAuth (e2e)', () => {
  let app: INestApplication;
  const cleanupPrisma = getPrismaClient();
  const createdEmails: string[] = [];

  function trackEmail(email: string): string {
    createdEmails.push(email);
    return email;
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
    await cleanupPrisma.oAuthAccount.deleteMany({
      where: { user: { email: { in: createdEmails } } },
    });
    await cleanupPrisma.consentRecord.deleteMany({
      where: { user: { email: { in: createdEmails } } },
    });
    await cleanupPrisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    // OAuthState carries no userId (issued pre-identity) — nothing else in
    // this dev/test database legitimately creates rows here, so a blanket
    // cleanup is safe and keeps the table empty between runs the same way
    // every other ephemeral-token table is left after this suite.
    await cleanupPrisma.oAuthState.deleteMany({});
    await cleanupPrisma.$disconnect();
    await app.close();
  });

  describe('GET /v1/auth/oauth/google', () => {
    it('redirects to Google with a CSRF state param, and persists a matching OAuthState row', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/oauth/google');

      expect(res.status).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.hostname).toBe('accounts.google.com');
      const state = location.searchParams.get('state');
      expect(state).toBeTruthy();

      const stateRows = await cleanupPrisma.oAuthState.findMany({
        where: { provider: 'GOOGLE' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(stateRows).toHaveLength(1);
      expect(stateRows[0]?.usedAt).toBeNull();
    });
  });

  describe('GET /v1/auth/oauth/apple', () => {
    it('redirects to Apple with a CSRF state param', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/oauth/apple');

      expect(res.status).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.hostname).toBe('appleid.apple.com');
      expect(location.searchParams.get('state')).toBeTruthy();
    });
  });

  describe('GET /v1/auth/oauth/google/callback — state rejection (Part 16 OAuth security test class)', () => {
    it('rejects a missing state with 401, never reaching a provider exchange', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/oauth/google/callback');
      expect(res.status).toBe(401);
    });

    it('rejects an unknown/invalid state with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/oauth/google/callback')
        .query({ state: 'not-a-real-state' });
      expect(res.status).toBe(401);
    });

    it('rejects an already-used (reused) state with 401', async () => {
      const oauthService = app.get(OAuthService);
      const rawState = await oauthService.createState('GOOGLE');
      // Consumed once directly (not via HTTP) — a real HTTP callback with a
      // still-valid state would proceed past the guard into Passport's own
      // canActivate, which performs the actual provider exchange. Consuming
      // it out-of-band here proves single-use without ever risking that.
      await oauthService.consumeState('GOOGLE', rawState);

      const res = await request(app.getHttpServer())
        .get('/v1/auth/oauth/google/callback')
        .query({ state: rawState });
      expect(res.status).toBe(401);
    });

    it('rejects a state issued for a different provider (GOOGLE state replayed against the apple callback)', async () => {
      const oauthService = app.get(OAuthService);
      const rawState = await oauthService.createState('GOOGLE');

      const res = await request(app.getHttpServer())
        .post('/v1/auth/oauth/apple/callback')
        .send({ state: rawState });
      expect(res.status).toBe(401);
    });

    it('rejects an expired state (Part 8: "10 minute, single-use") even though it was never consumed — expiresAt alone is enough to reject it', async () => {
      const oauthService = app.get(OAuthService);
      const rawState = await oauthService.createState('GOOGLE');
      const stateRow = await cleanupPrisma.oAuthState.findFirst({
        where: { provider: 'GOOGLE' },
        orderBy: { createdAt: 'desc' },
      });
      await cleanupPrisma.oAuthState.update({
        where: { id: stateRow!.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/oauth/google/callback')
        .query({ state: rawState });

      expect(res.status).toBe(401);
      // Still genuinely unused — an expired state is rejected on expiry
      // alone, not by (incorrectly) marking it used along the way.
      const stillUnused = await cleanupPrisma.oAuthState.findUnique({
        where: { id: stateRow!.id },
      });
      expect(stillUnused?.usedAt).toBeNull();
    });
  });

  /**
   * Apple's own callback guard (`AppleCallbackGuard`) reuses the identical
   * `consumeState` mechanism Google's does — these mirror
   * `GET .../google/callback`'s own coverage above rather than trusting
   * that "same underlying function" implies "equally proven," since the
   * suite previously only ever exercised Apple's callback with a *missing*
   * state, never an invalid or reused one.
   */
  describe('POST /v1/auth/oauth/apple/callback — state rejection', () => {
    it('rejects a missing state with 401', async () => {
      const res = await request(app.getHttpServer()).post('/v1/auth/oauth/apple/callback').send({});
      expect(res.status).toBe(401);
    });

    it('rejects an unknown/invalid state with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/oauth/apple/callback')
        .send({ state: 'not-a-real-state' });
      expect(res.status).toBe(401);
    });

    it('rejects an already-used (reused) state with 401', async () => {
      const oauthService = app.get(OAuthService);
      const rawState = await oauthService.createState('APPLE');
      await oauthService.consumeState('APPLE', rawState);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/oauth/apple/callback')
        .send({ state: rawState });
      expect(res.status).toBe(401);
    });

    it('rejects a state issued for a different provider (APPLE state replayed against the google callback)', async () => {
      const oauthService = app.get(OAuthService);
      const rawState = await oauthService.createState('APPLE');

      const res = await request(app.getHttpServer())
        .get('/v1/auth/oauth/google/callback')
        .query({ state: rawState });
      expect(res.status).toBe(401);
    });
  });

  describe('OAuthService.handleProviderProfile — account matching (direct integration, Part 8 High-3)', () => {
    it('creates a new User + OAuthAccount + TOS/PRIVACY_POLICY consent for a genuinely new (provider, providerAccountId)', async () => {
      const oauthService = app.get(OAuthService);
      const email = trackEmail(`oauth-${randomUUID()}@test.local`);
      const providerAccountId = `google-${randomUUID()}`;

      const outcome = await oauthService.handleProviderProfile(
        { provider: 'GOOGLE', providerAccountId, email, displayName: 'OAuth Test User' },
        'jest-agent',
        null,
      );

      expect(outcome.kind).toBe('authenticated');
      if (outcome.kind !== 'authenticated') throw new Error('unreachable');
      expect(outcome.user.email).toBe(email);
      expect(outcome.user).not.toHaveProperty('passwordHash');

      const account = await cleanupPrisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId } },
      });
      expect(account?.userId).toBe(outcome.user.id);

      const consents = await cleanupPrisma.consentRecord.findMany({
        where: { userId: outcome.user.id },
      });
      expect(consents.map((c) => c.consentType).sort()).toEqual(['PRIVACY_POLICY', 'TOS']);
    });

    it('authenticates the same existing user on a second sign-in with the same (provider, providerAccountId), without creating a duplicate', async () => {
      const oauthService = app.get(OAuthService);
      const email = trackEmail(`oauth-${randomUUID()}@test.local`);
      const providerAccountId = `google-${randomUUID()}`;
      const profile = {
        provider: 'GOOGLE' as const,
        providerAccountId,
        email,
        displayName: 'Repeat Sign-in',
      };

      const first = await oauthService.handleProviderProfile(profile, null, null);
      const second = await oauthService.handleProviderProfile(profile, null, null);

      expect(first.kind).toBe('authenticated');
      expect(second.kind).toBe('authenticated');
      if (first.kind !== 'authenticated' || second.kind !== 'authenticated')
        throw new Error('unreachable');
      expect(second.user.id).toBe(first.user.id);

      const accounts = await cleanupPrisma.oAuthAccount.findMany({
        where: { provider: 'GOOGLE', providerAccountId },
      });
      expect(accounts).toHaveLength(1);
    });

    it('never auto-links: a new (provider, providerAccountId) whose email matches an existing password-registered User returns link_required and creates nothing', async () => {
      const email = trackEmail(`oauth-conflict-${randomUUID()}@test.local`);
      const registerRes = await request(app.getHttpServer()).post('/v1/auth/register').send({
        email,
        password: 'correct horse battery staple',
        displayName: 'Existing Password User',
        locale: 'en-US',
        timezone: 'UTC',
        tosAccepted: true,
        privacyPolicyAccepted: true,
      });
      expect(registerRes.status).toBe(201);

      const oauthService = app.get(OAuthService);
      const providerAccountId = `google-${randomUUID()}`;
      const outcome = await oauthService.handleProviderProfile(
        { provider: 'GOOGLE', providerAccountId, email, displayName: 'Attempted Takeover' },
        null,
        null,
      );

      expect(outcome).toEqual({ kind: 'link_required', email });

      const account = await cleanupPrisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId } },
      });
      expect(account).toBeNull();
    });
  });

  describe('GET /v1/users/me/oauth-accounts/link/:provider — E2-T12', () => {
    it('rejects an unauthenticated linking attempt with 401, for both providers', async () => {
      const googleRes = await request(app.getHttpServer()).get(
        '/v1/users/me/oauth-accounts/link/google',
      );
      expect(googleRes.status).toBe(401);

      const appleRes = await request(app.getHttpServer()).get(
        '/v1/users/me/oauth-accounts/link/apple',
      );
      expect(appleRes.status).toBe(401);
    });

    it("redirects to Google with a CSRF state tagged with the authenticated caller's own userId", async () => {
      const email = trackEmail(`oauth-link-${randomUUID()}@test.local`);
      const registerRes = await request(app.getHttpServer()).post('/v1/auth/register').send({
        email,
        password: 'correct horse battery staple',
        displayName: 'Linking Test User',
        locale: 'en-US',
        timezone: 'UTC',
        tosAccepted: true,
        privacyPolicyAccepted: true,
      });
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'correct horse battery staple' });

      const res = await request(app.getHttpServer())
        .get('/v1/users/me/oauth-accounts/link/google')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

      expect(res.status).toBe(302);
      const location = new URL(res.headers.location as string);
      const state = location.searchParams.get('state');
      expect(state).toBeTruthy();

      const stateRow = await cleanupPrisma.oAuthState.findFirst({
        where: { provider: 'GOOGLE', linkingUserId: registerRes.body.id as string },
        orderBy: { createdAt: 'desc' },
      });
      expect(stateRow).not.toBeNull();
    });
  });

  describe('OAuthService.linkProviderToUser / handleResolvedProfile — authenticated linking (E2-T12)', () => {
    it('the full narrative: OAuth login for an existing password account is refused (link_required, no merge) until the user explicitly links it while authenticated — after which OAuth login authenticates as that same user', async () => {
      const email = trackEmail(`oauth-narrative-${randomUUID()}@test.local`);
      const registerRes = await request(app.getHttpServer()).post('/v1/auth/register').send({
        email,
        password: 'correct horse battery staple',
        displayName: 'Narrative Test User',
        locale: 'en-US',
        timezone: 'UTC',
        tosAccepted: true,
        privacyPolicyAccepted: true,
      });
      const userId = registerRes.body.id as string;
      const oauthService = app.get(OAuthService);
      const providerAccountId = `google-${randomUUID()}`;
      const profile = {
        provider: 'GOOGLE' as const,
        providerAccountId,
        email,
        displayName: 'Narrative OAuth',
      };

      // Step 1: an anonymous OAuth sign-in attempt does NOT merge — this is
      // the exact scenario E2-T12's acceptance criteria names.
      const anonymousAttempt = await oauthService.handleResolvedProfile(profile, null, null, null);
      expect(anonymousAttempt).toEqual({ kind: 'link_required', email });
      const beforeLinking = await cleanupPrisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId } },
      });
      expect(beforeLinking).toBeNull();

      // Step 2: the user proves ownership by logging in with their existing
      // password (Part 8's documented remedy), then explicitly links —
      // simulating the completed redirect flow's resolved profile, tagged
      // with their own userId exactly as GoogleLinkStartGuard would tag it.
      const linkOutcome = await oauthService.handleResolvedProfile(profile, userId, null, null);
      expect(linkOutcome).toEqual({
        kind: 'linked',
        provider: 'GOOGLE',
        providerAccountId,
        linkedAt: expect.any(String) as unknown as string,
      });

      const afterLinking = await cleanupPrisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId } },
      });
      expect(afterLinking?.userId).toBe(userId);

      // Step 3: NOW an ordinary OAuth login with this exact identity
      // authenticates as the same, already-existing user — not a new one.
      const subsequentLogin = await oauthService.handleResolvedProfile(profile, null, null, null);
      expect(subsequentLogin.kind).toBe('authenticated');
      if (subsequentLogin.kind !== 'authenticated') throw new Error('unreachable');
      expect(subsequentLogin.user.id).toBe(userId);

      const accountCount = await cleanupPrisma.oAuthAccount.count({ where: { userId } });
      expect(accountCount).toBe(1);
    });

    it('rejects linking a (provider, providerAccountId) already linked to a different user with 409, and does not affect the original link', async () => {
      const ownerEmail = trackEmail(`oauth-owner-${randomUUID()}@test.local`);
      const attackerEmail = trackEmail(`oauth-attacker-${randomUUID()}@test.local`);
      const oauthService = app.get(OAuthService);
      const providerAccountId = `google-${randomUUID()}`;

      const ownerOutcome = await oauthService.handleResolvedProfile(
        { provider: 'GOOGLE', providerAccountId, email: ownerEmail, displayName: 'Owner' },
        null,
        null,
        null,
      );
      expect(ownerOutcome.kind).toBe('authenticated');
      if (ownerOutcome.kind !== 'authenticated') throw new Error('unreachable');

      const attackerRegisterRes = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: attackerEmail,
          password: 'correct horse battery staple',
          displayName: 'Attacker',
          locale: 'en-US',
          timezone: 'UTC',
          tosAccepted: true,
          privacyPolicyAccepted: true,
        });
      const attackerId = attackerRegisterRes.body.id as string;

      await expect(
        oauthService.handleResolvedProfile(
          { provider: 'GOOGLE', providerAccountId, email: attackerEmail, displayName: 'Attacker' },
          attackerId,
          null,
          null,
        ),
      ).rejects.toMatchObject({ status: 409 });

      const account = await cleanupPrisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId } },
      });
      expect(account?.userId).toBe(ownerOutcome.user.id);
    });
  });
});
