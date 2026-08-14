import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  MfaChallengeRequest,
  MfaEnrollResponse,
  MfaVerifyRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PublicUser,
  RefreshResponse,
  RegisterRequest,
} from '@linguaai/validation/identity';

import { useSessionStore } from './session-store';

/** API.md §4 / API_GUIDELINES.md §3 error envelope — `global-exception.filter.ts`'s own shape, mirrored here rather than re-derived per call site. */
export interface ApiErrorBody {
  error: { code: string; message: string; requestId?: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.requestId;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
}

/**
 * One `AuthClient` per app origin (`apps/web`/`apps/admin` each configure
 * their own instance with their own `API_URL`) — see each app's
 * `src/lib/auth-client.ts`. `credentials: 'include'` on every call, always:
 * the httpOnly refresh cookie is `SameSite=Strict` (`auth.controller.ts`),
 * which — per the cookie spec — is scoped by registrable domain, not port,
 * so a same-site, cross-*origin* fetch (`localhost:3000` → `localhost:4000`)
 * still attaches it; the browser's CORS check (not SameSite) is what
 * actually gates this, which is why `main.ts` now enables
 * `credentials: true` CORS scoped to `APP_URL`/`ADMIN_URL` specifically —
 * a wildcard origin is incompatible with credentialed requests entirely.
 */
export function createAuthClient(baseUrl: string) {
  async function raw<T>(
    path: string,
    options: RequestOptions = {},
    authToken?: string,
  ): Promise<T> {
    const { method = 'GET', body } = options;
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const errorBody: ApiErrorBody =
        json !== null && typeof json === 'object' && 'error' in json
          ? (json as ApiErrorBody)
          : { error: { code: 'UNKNOWN', message: res.statusText || 'Request failed' } };
      throw new ApiError(res.status, errorBody);
    }
    return json as T;
  }

  /**
   * Re-establishes a session from the httpOnly refresh cookie alone — the
   * only way a page load (which always starts with an empty in-memory
   * store, by design) can recover "already logged in" state. Silent
   * failure (returns `null`, never throws) is deliberate: an absent/expired
   * cookie is the ordinary "not logged in" case, not an error condition.
   */
  async function bootstrapSession(): Promise<PublicUser | null> {
    try {
      const { accessToken } = await raw<RefreshResponse>('/v1/auth/refresh', { method: 'POST' });
      const me = await raw<CurrentUserResponse>('/v1/users/me', {}, accessToken);
      useSessionStore.getState().setSession(accessToken, me);
      return me;
    } catch {
      useSessionStore.getState().clear();
      return null;
    }
  }

  /**
   * Wraps any Bearer-authenticated call with one retry via
   * `bootstrapSession` on a 401 — the access token in memory can go stale
   * (page sat idle past its TTL) without the user having done anything
   * wrong; a transparent silent-refresh-and-retry is the correct UX, not a
   * hard redirect to `/login` on the first expiry. If the refresh cookie
   * itself is also gone, `bootstrapSession` clears the store and this
   * rethrows the original 401 — the caller's own error handling (or a
   * route guard checking `useSessionStore`) is what actually redirects.
   */
  async function authed<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = useSessionStore.getState().accessToken;
    try {
      return await raw<T>(path, options, token ?? undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const user = await bootstrapSession();
        if (user) {
          const retryToken = useSessionStore.getState().accessToken;
          return raw<T>(path, options, retryToken ?? undefined);
        }
      }
      throw err;
    }
  }

  return {
    bootstrapSession,
    register: (dto: RegisterRequest) =>
      raw<PublicUser>('/v1/auth/register', { method: 'POST', body: dto }),
    login: (dto: LoginRequest) =>
      raw<LoginResponse>('/v1/auth/login', { method: 'POST', body: dto }),
    mfaChallenge: (dto: MfaChallengeRequest) =>
      raw<LoginResponse>('/v1/auth/mfa/challenge', { method: 'POST', body: dto }),
    requestPasswordReset: (dto: PasswordResetRequest) =>
      raw<PasswordResetRequestResponse>('/v1/auth/password-reset/request', {
        method: 'POST',
        body: dto,
      }),
    confirmPasswordReset: (dto: PasswordResetConfirmRequest) =>
      raw<void>('/v1/auth/password-reset/confirm', { method: 'POST', body: dto }),
    getCurrentUser: () => authed<CurrentUserResponse>('/v1/users/me'),
    mfaEnroll: () => authed<MfaEnrollResponse>('/v1/auth/mfa/enroll', { method: 'POST' }),
    mfaVerify: (dto: MfaVerifyRequest) =>
      authed<void>('/v1/auth/mfa/verify', { method: 'POST', body: dto }),
    logout: () => authed<void>('/v1/auth/logout', { method: 'POST' }),
    /**
     * The same 401-retry-aware Bearer-authenticated call `getCurrentUser`/
     * `mfaEnroll`/etc. above already use internally, exposed generically —
     * every non-auth REST resource (courses, daily-goals, and whatever
     * follows) needs this exact transport and previously had no way to
     * reach it without hand-rolling its own fetch wrapper per app. Lives
     * here, not duplicated into apps/web and apps/admin separately, per
     * this repo's own "cross-app logic belongs in packages/" rule.
     */
    request: <T>(path: string, options?: RequestOptions) => authed<T>(path, options),
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
