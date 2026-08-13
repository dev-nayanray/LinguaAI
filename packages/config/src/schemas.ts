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

/** Same blank-string-tolerant treatment as `optionalUrl` above, for an optional field that isn't a URL. */
const optionalNonEmptyString = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().min(1).optional(),
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

/**
 * The `app_role`-only half of `appDatabaseEnvSchema` above — for a
 * `services/*` consumer (ai-engine, E5 T4; ADR-036) that needs a real,
 * least-privilege application database connection but has no
 * `app_service_role` (`BYPASSRLS`) use case at all, unlike apps/api's
 * small, explicitly-named set of exceptions (ADR-022). Kept as its own
 * fragment rather than reusing `appDatabaseEnvSchema` wholesale, so a
 * service with no BYPASSRLS need is never required to configure a
 * credential it will never use.
 */
export const appRoleDatabaseEnvSchema = z.object({
  APP_DATABASE_URL: z.string().url(),
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

/**
 * Consumed by `services/ai-engine`'s gateway module (E5 T1 — the first
 * epic to actually need this fragment; see this file's own header note
 * on why AI/LLM config wasn't scaffolded speculatively ahead of E5).
 * `AI_GATEWAY_DEFAULT_PROVIDER` picks the Router's primary generation
 * provider; the other configured provider (whichever of Anthropic/OpenAI
 * isn't primary) is the failover target (ARCHITECTURE.md §7.1). Both API
 * keys are required even though only one provider is primary at a time —
 * failover with no working secondary credential is not real failover.
 */
export const aiGatewayEnvSchema = z.object({
  AI_GATEWAY_DEFAULT_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  AI_MODEL_TEACHER_DEFAULT: z.string().min(1),
  AI_MODEL_ASSESSMENT_DEFAULT: z.string().min(1),
  /** E8 T4 (ADR-041) — the third `AiRequestClass`, AI-assisted content drafting (`services/ai-engine/src/content-authoring/`). Neither `'teacher'` (conversational) nor `'assessment'` (scoring) fits a content-generation call — the same class of gap ADR-039 already found for `PromptManagerService`'s own persona union. */
  AI_MODEL_CONTENT_DEFAULT: z.string().min(1),
  /** E10 T5 (ADR-048) — the fourth `AiRequestClass`, session-end speaking-practice fluency scoring (`services/ai-engine/src/fluency-scoring/`). A structured-output, one-shot rubric-scoring call over a full conversation transcript — a materially different shape from single-essay `'assessment'` scoring or freeform `'content'` drafting, the same "per-class cost monitoring stays meaningful" reasoning ADR-041 already established. */
  AI_MODEL_FLUENCY_DEFAULT: z.string().min(1),
  /** E13 T1 (ADR-052) — the fifth `AiRequestClass`, RAG-grounded writing correction (`services/ai-engine/src/writing-coaching/`). A materially different rubric/purpose from single-essay placement `'assessment'` scoring: ongoing, repeatable formative practice, not a CEFR-banded placement critique — the same category-error avoidance ADR-039/041/048 each already established for their own domains. */
  AI_MODEL_WRITING_DEFAULT: z.string().min(1),
  /**
   * ADR-034 (E5 T9): the cost circuit breaker's DEGRADE stage target —
   * "degrade new requests to a cheaper model tier where the request
   * class allows it." Deliberately optional: with no economy model
   * configured for a class, DEGRADE has no real target to switch to for
   * that class and the Router falls back to the default model rather
   * than fabricating a guessed cheap-model name.
   */
  AI_MODEL_TEACHER_ECONOMY: optionalNonEmptyString,
  AI_MODEL_ASSESSMENT_ECONOMY: optionalNonEmptyString,
  AI_MODEL_CONTENT_ECONOMY: optionalNonEmptyString,
  AI_MODEL_FLUENCY_ECONOMY: optionalNonEmptyString,
  AI_MODEL_WRITING_ECONOMY: optionalNonEmptyString,
});
export type AiGatewayEnv = z.infer<typeof aiGatewayEnvSchema>;

/**
 * Consumed by `apps/api`'s `AiEngineClientModule` (E5 T10, ADR-033) — the
 * base URL of the `ai-engine` service this client calls internally.
 * `.env.example` already declares `AI_ENGINE_URL` (E1 Part 7, alongside
 * every other `services/*` URL) but no consumer validated it as a schema
 * fragment until this task actually needed to call it — the same "not
 * scaffolded speculatively ahead of need" convention `aiGatewayEnvSchema`'s
 * own header comment documents.
 */
export const aiEngineClientEnvSchema = z.object({
  AI_ENGINE_URL: z.string().url(),
});
export type AiEngineClientEnv = z.infer<typeof aiEngineClientEnvSchema>;

/**
 * Consumed by `apps/api`'s own new `PronunciationModule` (E11 T2) —
 * `SPEECH_SERVICE_URL` has existed in `.env`/`.env.example` since E1 but,
 * confirmed by a full-repo search, was never consumed by any real
 * application code until now (only a health-check e2e script referenced
 * it). This is `apps/api`'s first-ever direct HTTP client relationship to
 * `speech-service` — previously `apps/api` only ever minted a token for
 * the *client* to connect to `speech-service` directly (E10 T2, ADR-043).
 */
export const speechServiceClientEnvSchema = z.object({
  SPEECH_SERVICE_URL: z.string().url(),
});
export type SpeechServiceClientEnv = z.infer<typeof speechServiceClientEnvSchema>;

/**
 * Consumed by both `apps/api` (signs, E10 T1/T2 `SpeakingModule`) and
 * `services/speech-service` (verifies, T1) — the shared HMAC secret behind
 * the short-lived internal token that authorizes a client's direct
 * WebSocket connection to `speech-service` (design doc §6.2, ADR-043).
 * Declared as its own minimal fragment rather than folded into
 * `authEnvSchema` (a materially different purpose/rotation schedule from
 * the user-facing access-token secret) — the same "own fragment per
 * distinct secret" discipline `loginFailureEnvSchema`/`mfaEnvSchema`
 * already established. A base64-encoded 32-byte key
 * (`openssl rand -base64 32`), the same convention `MFA_SECRET_ENCRYPTION_KEY`
 * already documents.
 */
export const speechSessionTokenEnvSchema = z.object({
  SPEECH_SESSION_TOKEN_SECRET: z.string().min(1),
});
export type SpeechSessionTokenEnv = z.infer<typeof speechSessionTokenEnvSchema>;

/**
 * Consumed by `services/speech-service`'s own speech-provider module (E10
 * T1, ADR-043) — reuses the platform's already-integrated `OPENAI_API_KEY`
 * as its own independently-declared fragment (the same
 * `appDatabaseEnvSchema`/`appRoleDatabaseEnvSchema` precedent: a service
 * with no need for `aiGatewayEnvSchema`'s own wider surface — Anthropic
 * key, per-request-class model names — is never required to configure
 * credentials it will never use).
 */
export const speechProviderEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});
export type SpeechProviderEnv = z.infer<typeof speechProviderEnvSchema>;

/**
 * Consumed by `services/speech-service`'s own audio-storage module (E10 T4,
 * ADR-047) — this platform's first real consumer of the S3-compatible
 * object-storage config `.env`/`.env.example` have declared as plumbing
 * since E1 (`S3_ENDPOINT`/`S3_BUCKET`/etc., DATABASE.md's own object-
 * storage target) but no code has ever read until now, the same
 * "pattern specified, value left open" gap ADR-031/043 already closed for
 * the embedding model / speech providers. `S3_FORCE_PATH_STYLE` defaults to
 * `false` (real AWS S3's own default — virtual-hosted-style URLs) via a
 * string-to-boolean transform; local dev's own `.env` sets it `true`
 * (MinIO requires path-style addressing).
 */
export const objectStorageEnvSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
});
export type ObjectStorageEnv = z.infer<typeof objectStorageEnvSchema>;

/**
 * Consumed by `services/speech-service`'s own new pronunciation-provider
 * module (E11 T1, ADR-049) — `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` were
 * originally scaffolded at E1 for a since-abandoned STT/TTS provider
 * choice, confirmed unconsumed by any code and removed at E10 T1 (ADR-043
 * pinned OpenAI instead). This epic is their real, first-ever consumer —
 * a legitimate reintroduction, not a reversal of that earlier cleanup.
 */
export const pronunciationProviderEnvSchema = z.object({
  AZURE_SPEECH_KEY: z.string().min(1),
  AZURE_SPEECH_REGION: z.string().min(1),
});
export type PronunciationProviderEnv = z.infer<typeof pronunciationProviderEnvSchema>;

/**
 * Consumed by `apps/api`'s own new `BillingModule` (E15 T1, design doc
 * §6.1). Deliberately **not** `.min(1)` on the Stripe fields, unlike every
 * other real-provider-key schema above (`ANTHROPIC_API_KEY`,
 * `AZURE_SPEECH_KEY`, ...) — those are all loaded by a *separately-booted*
 * service process (`services/ai-engine`, `services/speech-service`) whose
 * own e2e tests never run through `apps/api`'s own `AppModule`. Stripe
 * integrates directly, in-process, inside `apps/api` (no independent-
 * scaling/isolation reason for a new service, CLAUDE.md's own bar), so a
 * strict, non-empty requirement here would fail *every* `apps/api` e2e
 * test's own `app.init()` in this environment, where no real Stripe test
 * key is provisioned (`.env`'s own `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
 * are present but empty). The real Stripe API boundary is a separate,
 * `overrideProvider`-stubbable `StripeClientService` — the same "mock the
 * boundary, not the module" precedent `AiEngineClientService`/
 * `writing-submissions.e2e-spec.ts` already established (E13).
 */
export const billingEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
});
export type BillingEnv = z.infer<typeof billingEnvSchema>;

export type NodeEnv = z.infer<typeof nodeEnvSchema>;
export type ServerUrlEnv = z.infer<typeof serverUrlEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type ObservabilityEnv = z.infer<typeof observabilityEnvSchema>;
export type AppDatabaseEnv = z.infer<typeof appDatabaseEnvSchema>;
export type AppRoleDatabaseEnv = z.infer<typeof appRoleDatabaseEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type OAuthEnv = z.infer<typeof oauthEnvSchema>;
export type MfaEnv = z.infer<typeof mfaEnvSchema>;
