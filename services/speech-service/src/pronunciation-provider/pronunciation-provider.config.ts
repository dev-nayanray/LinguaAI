import { loadConfig, pronunciationProviderEnvSchema } from '@linguaai/config';

export const PRONUNCIATION_PROVIDER_CONFIG = Symbol('PRONUNCIATION_PROVIDER_CONFIG');
export const PRONUNCIATION_PROVIDER = Symbol('PRONUNCIATION_PROVIDER');

export interface PronunciationProviderModuleConfig {
  azureSpeechKey: string;
  azureSpeechRegion: string;
}

/** Validated once, at module load (fail-fast, DEPLOYMENT.md §7) — same pattern as `resolveSpeechProviderConfig`/`resolveAudioStorageConfig`. */
export function resolvePronunciationProviderConfig(): PronunciationProviderModuleConfig {
  const env = loadConfig(pronunciationProviderEnvSchema);
  return { azureSpeechKey: env.AZURE_SPEECH_KEY, azureSpeechRegion: env.AZURE_SPEECH_REGION };
}
