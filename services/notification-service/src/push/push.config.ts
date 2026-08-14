import { loadConfig, pushEnvSchema, type PushEnv } from '@linguaai/config';

export function resolvePushConfig(): PushEnv {
  return loadConfig(pushEnvSchema);
}
