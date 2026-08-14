import {
  loadConfig,
  serviceRoleDatabaseEnvSchema,
  type ServiceRoleDatabaseEnv,
} from '@linguaai/config';

export const NOTIFICATION_SERVICE_PRISMA_CLIENT = Symbol('NOTIFICATION_SERVICE_PRISMA_CLIENT');

export function resolveDatabaseConfig(): ServiceRoleDatabaseEnv {
  return loadConfig(serviceRoleDatabaseEnvSchema);
}
