import { loadConfig, speechProviderEnvSchema } from '@linguaai/config';

export const SPEECH_PROVIDER_CONFIG = Symbol('SPEECH_PROVIDER_CONFIG');
/** Interfaces don't exist at runtime — the module provides a concrete `OpenAiSpeechProvider` instance by these tokens, mirroring `ai-engine`'s own `ANTHROPIC_PROVIDER`/`OPENAI_PROVIDER` token pattern (`gateway.config.ts`). */
export const STT_PROVIDER = Symbol('STT_PROVIDER');
export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export interface SpeechProviderModuleConfig {
  openAiApiKey: string;
}

/** Validated once, at module load (fail-fast, DEPLOYMENT.md §7) — same pattern as `ai-engine`'s own `resolveAiGatewayConfig`. */
export function resolveSpeechProviderConfig(): SpeechProviderModuleConfig {
  const env = loadConfig(speechProviderEnvSchema);
  return { openAiApiKey: env.OPENAI_API_KEY };
}
