import { appRoleDatabaseEnvSchema, loadConfig, type AppRoleDatabaseEnv } from '@linguaai/config';

export const RECOMMENDATION_ENGINE_PRISMA_CLIENT = Symbol('RECOMMENDATION_ENGINE_PRISMA_CLIENT');

export function resolveDatabaseConfig(): AppRoleDatabaseEnv {
  return loadConfig(appRoleDatabaseEnvSchema);
}
