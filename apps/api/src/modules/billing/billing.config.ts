import { billingEnvSchema, loadConfig, type BillingEnv } from '@linguaai/config';

export const BILLING_CONFIG = Symbol('BILLING_CONFIG');

/**
 * Validated once, at module load (fail-fast, DEPLOYMENT.md §7), inside
 * `BillingModule`'s own provider factory — never at this file's top level,
 * matching `auth.module.ts`'s own documented reason (E2-T16): a file
 * transitively imported through a barrel, even just for a type, must not
 * crash a plain unit test that never boots this module for real.
 */
export function resolveBillingConfig(): BillingEnv {
  return loadConfig(billingEnvSchema);
}
