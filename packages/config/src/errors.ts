import type { ZodIssue } from 'zod';

/**
 * Thrown by {@link loadConfig} when the environment fails schema validation.
 * The message lists every failing field so a boot-time crash is immediately
 * actionable, not a bare "invalid config" with no indication of what to fix.
 */
export class ConfigValidationError extends Error {
  constructor(issues: ZodIssue[]) {
    const lines = issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    super(['Invalid or missing environment configuration:', ...lines].join('\n'));
    this.name = 'ConfigValidationError';
  }
}
