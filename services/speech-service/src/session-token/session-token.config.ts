import { loadConfig, speechSessionTokenEnvSchema } from '@linguaai/config';

export const SESSION_TOKEN_CONFIG = Symbol('SESSION_TOKEN_CONFIG');

export interface SessionTokenModuleConfig {
  secret: string;
}

/** Validated once, at module load (fail-fast, DEPLOYMENT.md §7) — same pattern as `speech-provider.config.ts`. The shared secret itself is `apps/api`'s own signing counterpart (E10 T2, design doc §6.2, ADR-043). */
export function resolveSessionTokenConfig(): SessionTokenModuleConfig {
  const env = loadConfig(speechSessionTokenEnvSchema);
  return { secret: env.SPEECH_SESSION_TOKEN_SECRET };
}
