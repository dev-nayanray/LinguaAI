import { appRoleDatabaseEnvSchema, loadConfig, type AppRoleDatabaseEnv } from '@linguaai/config';

export const AI_ENGINE_PRISMA_CLIENT = Symbol('AI_ENGINE_PRISMA_CLIENT');

export function resolveDatabaseConfig(): AppRoleDatabaseEnv {
  return loadConfig(appRoleDatabaseEnvSchema);
}
