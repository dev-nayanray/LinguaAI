import type { z } from 'zod';

import { ConfigValidationError } from './errors.js';

/**
 * Validates `env` (defaults to `process.env`) against `schema` and returns
 * the typed, parsed result. Throws {@link ConfigValidationError} — never a
 * silent `undefined` reaching business logic later — if a required variable
 * is missing or fails its format check (DEPLOYMENT.md §7's fail-fast
 * requirement).
 */
export function loadConfig<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  env: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(env);

  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }

  return result.data as z.infer<TSchema>;
}
