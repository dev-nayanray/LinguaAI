import { emailEnvSchema, loadConfig, type EmailEnv } from '@linguaai/config';

export function resolveEmailConfig(): EmailEnv {
  return loadConfig(emailEnvSchema);
}
