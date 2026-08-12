import { aiEngineClientEnvSchema, loadConfig, type AiEngineClientEnv } from '@linguaai/config';

export const AI_ENGINE_CLIENT_CONFIG = Symbol('AI_ENGINE_CLIENT_CONFIG');

/**
 * Validated once, at module load (fail-fast, DEPLOYMENT.md §7), inside
 * `AiEngineClientModule`'s own provider factory — never at this file's top
 * level (`apps/api`'s own `ai-engine-client.config.ts` sets this precedent).
 * Reuses the exact same `aiEngineClientEnvSchema` `apps/api` already loads
 * independently — same env var, same schema, two independent `loadConfig`
 * calls per process, the same "own fragment, independently loaded per
 * consumer" precedent `speechSessionTokenEnvSchema` already established.
 */
export function resolveAiEngineClientConfig(): AiEngineClientEnv {
  return loadConfig(aiEngineClientEnvSchema);
}
