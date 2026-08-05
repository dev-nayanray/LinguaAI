import {
  authEnvSchema,
  loadConfig,
  loginFailureEnvSchema,
  mfaEnvSchema,
  oauthEnvSchema,
  type AuthEnv,
  type LoginFailureEnv,
  type MfaEnv,
  type OAuthEnv,
} from '@linguaai/config';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export const OAUTH_CONFIG = Symbol('OAUTH_CONFIG');
export const MFA_CONFIG = Symbol('MFA_CONFIG');
export const LOGIN_FAILURE_CONFIG = Symbol('LOGIN_FAILURE_CONFIG');

/**
 * Validated once, at module load (fail-fast, DEPLOYMENT.md §7) — shared via
 * DI (`AUTH_CONFIG`) rather than each file calling `loadConfig` again,
 * which would re-parse `process.env` redundantly and duplicate the
 * fail-fast check in more than one place.
 */
export function resolveAuthConfig(): AuthEnv {
  return loadConfig(authEnvSchema);
}

/** Same rationale as `resolveAuthConfig`, separated because Google/Apple strategies (E2-T11) need different env vars than JWT signing does. */
export function resolveOAuthConfig(): OAuthEnv {
  return loadConfig(oauthEnvSchema);
}

/** Same rationale as `resolveAuthConfig`, separated because `mfa.service.ts` (E2-T13) needs the field-level encryption key, not JWT/OAuth config. */
export function resolveMfaConfig(): MfaEnv {
  return loadConfig(mfaEnvSchema);
}

/** Same rationale as `resolveAuthConfig`, separated because `AuthService`'s `identity.login.failed` emission (E2-T20) needs its own HMAC key, distinct from `mfaEnvSchema`'s encryption key. */
export function resolveLoginFailureConfig(): LoginFailureEnv {
  return loadConfig(loginFailureEnvSchema);
}
