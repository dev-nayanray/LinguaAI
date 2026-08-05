import { z } from 'zod';

/**
 * `z.string().url().optional()` only tolerates the env var being absent
 * (undefined) — an explicitly blank value (`SENTRY_DSN=` in .env.example's
 * own documented convention for a not-yet-configured optional secret)
 * still reaches `.url()` and fails, since Zod's `.optional()` doesn't
 * treat `""` as `undefined`. Discovered via T22's e2e stack failing to
 * boot with a real ConfigValidationError against .env.example's own
 * default. Preprocessing blank strings to undefined first fixes this for
 * every optional URL field, not just the one that happened to be hit.
 */
const optionalUrl = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().url().optional(),
);

/**
 * Composable schema fragments mirroring .env.example's variable set —
 * apps/services `.merge()` together whichever fragments they actually need
 * rather than validate against one fixed, monolithic schema. A frontend app
 * doesn't need DATABASE_URL; a backend app doesn't need APP_URL. Only the
 * fragments genuinely needed to boot an E1 skeleton (Part 7) are defined
 * here — OAuth, AI/LLM, vector DB, speech, OCR, payments, email, and push
 * fragments are added by the epics that actually consume them (E5+),
 * deliberately, not scaffolded speculatively ahead of that need.
 */

export const nodeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
});

export const serverUrlEnvSchema = z.object({
  APP_URL: optionalUrl,
  API_URL: optionalUrl,
  ADMIN_URL: optionalUrl,
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.string().url(),
});

/** Consumed by packages/observability (T6) — SENTRY_DSN, LOG_LEVEL, OTLP endpoint. */
export const observabilityEnvSchema = z.object({
  SENTRY_DSN: optionalUrl,
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
});

/**
 * Consumed by apps/api's shared `DatabaseModule` (E2-T8, extracted to its
 * own module in E2-T10 once a second module — `UsersModule` — also needed
 * these clients). Additive, distinct from `DATABASE_URL` (the
 * migration-owning superuser, packages/database's `db:generate`/
 * `db:migrate` only) — the running application must never connect as that
 * role, or Postgres RLS (E2 Part 9) provides zero real protection.
 * `app_role` is RLS-subject and used for ordinary request-scoped queries;
 * `app_service_role` (`BYPASSRLS`) is used only by the small, named set of
 * pre-session code paths Part 9's "Service-role exception" describes
 * (registration, login's pre-auth credential lookup, bootstrap, GDPR
 * erasure).
 */
export const appDatabaseEnvSchema = z.object({
  APP_DATABASE_URL: z.string().url(),
  APP_SERVICE_ROLE_DATABASE_URL: z.string().url(),
});

/** Consumed by apps/api's AuthModule (E2-T8/T9) — JWT signing/verification only; database URLs live in `appDatabaseEnvSchema`. */
export const authEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().min(1),
  JWT_REFRESH_TTL: z.string().min(1),
});

/**
 * Consumed by apps/api's Google/Apple OAuth strategies (E2-T11). `API_URL`
 * is required (not the `serverUrlEnvSchema` optional form) — it builds the
 * absolute `callbackURL` both providers require, so a missing value must
 * fail fast rather than register a strategy pointed at `undefined`.
 */
export const oauthEnvSchema = z.object({
  API_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  APPLE_CLIENT_ID: z.string().min(1),
  APPLE_TEAM_ID: z.string().min(1),
  APPLE_KEY_ID: z.string().min(1),
  APPLE_PRIVATE_KEY: z.string().min(1),
});

/**
 * Consumed by apps/api's `mfa.service.ts` (E2-T13). `MFA_SECRET_ENCRYPTION_KEY`
 * encrypts `User.mfaSecret` at the application layer before it's ever
 * written (Part 5: "field-level encrypted", SECURITY.md §4) — a base64-
 * encoded 32-byte AES-256-GCM key (`openssl rand -base64 32`).
 */
export const mfaEnvSchema = z.object({
  MFA_SECRET_ENCRYPTION_KEY: z.string().min(1),
});

/**
 * Consumed by apps/api's `LocalStrategy`/`AuthService` (E2-T20) —
 * `identity.login.failed`'s HMAC-keyed email hash (Part 10: "an unkeyed
 * hash... is only marginally better than storing it raw"), a distinct
 * secret from `mfaEnvSchema`'s encryption key (different purpose, different
 * rotation schedule).
 */
export const loginFailureEnvSchema = z.object({
  LOGIN_FAILURE_HMAC_KEY: z.string().min(1),
});
export type LoginFailureEnv = z.infer<typeof loginFailureEnvSchema>;

export type NodeEnv = z.infer<typeof nodeEnvSchema>;
export type ServerUrlEnv = z.infer<typeof serverUrlEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type ObservabilityEnv = z.infer<typeof observabilityEnvSchema>;
export type AppDatabaseEnv = z.infer<typeof appDatabaseEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type OAuthEnv = z.infer<typeof oauthEnvSchema>;
export type MfaEnv = z.infer<typeof mfaEnvSchema>;
