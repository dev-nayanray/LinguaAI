import { loadConfig, objectStorageEnvSchema } from '@linguaai/config';

export const AUDIO_STORAGE_PROVIDER = Symbol('AUDIO_STORAGE_PROVIDER');

export interface AudioStorageModuleConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Validated once, at module load (fail-fast, DEPLOYMENT.md §7) — same pattern as `speech-provider.config.ts`. */
export function resolveAudioStorageConfig(): AudioStorageModuleConfig {
  const env = loadConfig(objectStorageEnvSchema);
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}
