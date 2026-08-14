import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@linguaai/validation/identity';

import { ApiError, createAuthClient } from './client';
import { useSessionStore } from './session-store';

const user: PublicUser = {
  id: 'u-1',
  email: 'user@test.local',
  displayName: 'Test User',
  avatarUrl: null,
  locale: 'en-US',
  timezone: 'UTC',
  role: 'USER',
  status: 'ACTIVE',
  mfaEnrolled: false,
  organizationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 204 ? 'No Content' : 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('createAuthClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const client = createAuthClient('http://api.test.local');

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useSessionStore.getState().clear();
  });

  it('register posts the payload and returns the created PublicUser, with credentials always included', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(201, user));

    const result = await client.register({
      email: user.email,
      password: 'correct horse battery staple',
      displayName: user.displayName,
      locale: user.locale,
      timezone: user.timezone,
      tosAccepted: true,
      privacyPolicyAccepted: true,
      marketingConsent: false,
    });

    expect(result).toEqual(user);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test.local/v1/auth/register');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
  });

  it('login returns the AUTHENTICATED shape directly, without touching the session store itself', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { status: 'AUTHENTICATED', accessToken: 'tok-1', user }),
    );

    const result = await client.login({ email: user.email, password: 'x' });

    expect(result).toEqual({ status: 'AUTHENTICATED', accessToken: 'tok-1', user });
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it('login returns the MFA_REQUIRED shape for a step-up-gated caller', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { status: 'MFA_REQUIRED', challengeToken: 'chal-1' }),
    );

    const result = await client.login({ email: user.email, password: 'x' });

    expect(result).toEqual({ status: 'MFA_REQUIRED', challengeToken: 'chal-1' });
  });

  it('a non-2xx response throws ApiError carrying status/code/message/requestId from the error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(401, {
        error: { code: 'AUTH_REQUIRED', message: 'Invalid email or password', requestId: 'req-1' },
      }),
    );

    await expect(client.login({ email: user.email, password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Invalid email or password',
      requestId: 'req-1',
    });
  });

  it('falls back to a generic error body when the response has no parseable JSON error envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 500,
      ok: false,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);

    await expect(client.login({ email: user.email, password: 'x' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('a 204 response resolves to undefined (confirmPasswordReset)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(204, null));

    await expect(
      client.confirmPasswordReset({ token: 't', newPassword: 'new password 12+' }),
    ).resolves.toBeUndefined();
  });

  it('getCurrentUser attaches the in-memory access token as a Bearer header', async () => {
    useSessionStore.getState().setSession('tok-1', user);
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { ...user, profile: null }));

    await client.getCurrentUser();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('on a 401, silently refreshes via the cookie and retries once — succeeding transparently', async () => {
    useSessionStore.getState().setSession('stale-token', user);
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'expired' } }),
      ) // first getCurrentUser attempt
      .mockResolvedValueOnce(fakeResponse(200, { accessToken: 'fresh-token' })) // /v1/auth/refresh
      .mockResolvedValueOnce(fakeResponse(200, { ...user, profile: null })) // /v1/users/me (inside bootstrapSession)
      .mockResolvedValueOnce(fakeResponse(200, { ...user, profile: null })); // retried getCurrentUser

    const result = await client.getCurrentUser();

    expect(result).toEqual({ ...user, profile: null });
    expect(useSessionStore.getState().accessToken).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('on a 401 with no valid refresh cookie either, clears the session and rethrows the original 401', async () => {
    useSessionStore.getState().setSession('stale-token', user);
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'expired' } }),
      ) // getCurrentUser
      .mockResolvedValueOnce(
        fakeResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'no cookie' } }),
      ); // /v1/auth/refresh fails

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      status: 401,
      message: 'expired',
    });
    expect(useSessionStore.getState().accessToken).toBeNull();
    expect(useSessionStore.getState().user).toBeNull();
  });

  it('bootstrapSession populates the store from the refresh cookie alone, with no prior state', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(200, { accessToken: 'fresh-token' }))
      .mockResolvedValueOnce(fakeResponse(200, { ...user, profile: null }));

    const result = await client.bootstrapSession();

    expect(result).toEqual({ ...user, profile: null });
    expect(useSessionStore.getState().accessToken).toBe('fresh-token');
  });

  it('bootstrapSession resolves to null (not a throw) when there is no valid refresh cookie', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'no cookie' } }),
    );

    await expect(client.bootstrapSession()).resolves.toBeNull();
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it('mfaChallenge posts the challengeToken/code pair and returns the resulting LoginResponse', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { status: 'AUTHENTICATED', accessToken: 'tok-2', user }),
    );

    const result = await client.mfaChallenge({ challengeToken: 'chal-1', code: '123456' });

    expect(result).toEqual({ status: 'AUTHENTICATED', accessToken: 'tok-2', user });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://api.test.local/v1/auth/mfa/challenge');
  });

  it('requestPasswordReset posts the email and returns the enumeration-resistant response', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { status: 'EMAIL_SENT' }));

    await expect(client.requestPasswordReset({ email: user.email })).resolves.toEqual({
      status: 'EMAIL_SENT',
    });
  });

  it('mfaEnroll attaches the Bearer token and returns the secret/otpauthUrl pair', async () => {
    useSessionStore.getState().setSession('tok-1', user);
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' }),
    );

    await expect(client.mfaEnroll()).resolves.toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://totp/x',
    });
  });

  it('mfaVerify posts the pending secret and code, resolving to undefined on success (204)', async () => {
    useSessionStore.getState().setSession('tok-1', user);
    fetchMock.mockResolvedValueOnce(fakeResponse(204, null));

    await expect(
      client.mfaVerify({ secret: 'JBSWY3DPEHPK3PXP', code: '123456' }),
    ).resolves.toBeUndefined();
  });

  it('logout is a Bearer-authenticated POST resolving to undefined on success (204)', async () => {
    useSessionStore.getState().setSession('tok-1', user);
    fetchMock.mockResolvedValueOnce(fakeResponse(204, null));

    await expect(client.logout()).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('request() reaches an arbitrary non-auth path as a Bearer-authenticated call', async () => {
    useSessionStore.getState().setSession('tok-1', user);
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { data: [], meta: { page: 1 } }));

    const result = await client.request<{ data: unknown[]; meta: { page: number } }>(
      '/v1/courses?page=1',
    );

    expect(result).toEqual({ data: [], meta: { page: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test.local/v1/courses?page=1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('request() shares the same silent-refresh-and-retry behavior as the built-in auth methods', async () => {
    useSessionStore.getState().setSession('stale-token', user);
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'expired' } }),
      ) // first request() attempt
      .mockResolvedValueOnce(fakeResponse(200, { accessToken: 'fresh-token' })) // /v1/auth/refresh
      .mockResolvedValueOnce(fakeResponse(200, { ...user, profile: null })) // /v1/users/me
      .mockResolvedValueOnce(fakeResponse(200, { id: 'daily-goal-1' })); // retried request()

    const result = await client.request<{ id: string }>('/v1/daily-goals/today');

    expect(result).toEqual({ id: 'daily-goal-1' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
