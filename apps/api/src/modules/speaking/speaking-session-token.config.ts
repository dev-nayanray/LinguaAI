import { loadConfig, speechSessionTokenEnvSchema } from '@linguaai/config';

export const SPEECH_SESSION_TOKEN_CONFIG = Symbol('SPEECH_SESSION_TOKEN_CONFIG');

export interface SpeechSessionTokenModuleConfig {
  secret: string;
}

/**
 * Validated once, at module load (fail-fast, DEPLOYMENT.md §7), inside
 * `SpeakingModule`'s own provider factory — never at this file's top level
 * (`ai-engine-client.config.ts`'s own documented reason). This is the
 * signing half of the shared HMAC secret `services/speech-service`'s own
 * `session-token.config.ts` (T1) independently loads and verifies with —
 * same env var, same schema, two independent `loadConfig` calls per
 * process, never shared state across services.
 */
export function resolveSpeechSessionTokenConfig(): SpeechSessionTokenModuleConfig {
  const env = loadConfig(speechSessionTokenEnvSchema);
  return { secret: env.SPEECH_SESSION_TOKEN_SECRET };
}
