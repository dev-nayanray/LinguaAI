import { aiEngineClientEnvSchema, loadConfig, type AiEngineClientEnv } from '@linguaai/config';

export const AI_ENGINE_CLIENT_CONFIG = Symbol('AI_ENGINE_CLIENT_CONFIG');

/**
 * Validated once, at module load (fail-fast, DEPLOYMENT.md §7), inside
 * `AiEngineClientModule`'s own provider factory — never at this file's top
 * level, matching `auth.module.ts`'s own documented reason (E2-T16): a
 * file transitively imported through a barrel, even just for a type, must
 * not crash a plain unit test that never boots this module for real and
 * never sets `AI_ENGINE_URL`.
 */
export function resolveAiEngineClientConfig(): AiEngineClientEnv {
  return loadConfig(aiEngineClientEnvSchema);
}
