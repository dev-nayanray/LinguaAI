import {
  loadConfig,
  speechServiceClientEnvSchema,
  type SpeechServiceClientEnv,
} from '@linguaai/config';

export const SPEECH_SERVICE_CLIENT_CONFIG = Symbol('SPEECH_SERVICE_CLIENT_CONFIG');

/**
 * Validated once, at module load (fail-fast, DEPLOYMENT.md §7), inside
 * `SpeechServiceClientModule`'s own provider factory — never at this
 * file's top level, matching `ai-engine-client.config.ts`'s own
 * documented reason (E2-T16): a file transitively imported through a
 * barrel, even just for a type, must not crash a plain unit test that
 * never boots this module for real and never sets `SPEECH_SERVICE_URL`.
 */
export function resolveSpeechServiceClientConfig(): SpeechServiceClientEnv {
  return loadConfig(speechServiceClientEnvSchema);
}
