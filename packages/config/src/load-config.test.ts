import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigValidationError } from './errors.js';
import { loadConfig } from './load-config.js';
import { databaseEnvSchema, nodeEnvSchema, redisEnvSchema } from './schemas.js';

describe('loadConfig', () => {
  it('returns the parsed, typed config when all required vars are present and valid', () => {
    const schema = z.object({ FOO: z.string() });

    const result = loadConfig(schema, { FOO: 'bar' });

    expect(result).toEqual({ FOO: 'bar' });
  });

  it('throws ConfigValidationError when a required var is missing', () => {
    const schema = z.object({ REQUIRED_VAR: z.string() });

    expect(() => loadConfig(schema, {})).toThrow(ConfigValidationError);
  });

  it('names the specific missing field in the thrown error message', () => {
    const schema = z.object({ REQUIRED_VAR: z.string() });

    expect(() => loadConfig(schema, {})).toThrow(/REQUIRED_VAR/);
  });

  it('throws when a present var fails its format check (e.g. an invalid URL)', () => {
    const schema = z.object({ DATABASE_URL: z.string().url() });

    expect(() => loadConfig(schema, { DATABASE_URL: 'not-a-url' })).toThrow(ConfigValidationError);
  });

  it('does not throw when an optional var is absent', () => {
    const schema = z.object({ OPTIONAL_VAR: z.string().optional() });

    expect(() => loadConfig(schema, {})).not.toThrow();
  });

  it('falls back to "(root)" in the error message for a schema-level (path-less) issue', () => {
    const schema = z.object({}).refine(() => false, { message: 'schema-level failure' });

    expect(() => loadConfig(schema, {})).toThrow(/\(root\): schema-level failure/);
  });

  it('defaults to process.env when no env argument is passed', () => {
    process.env.LOADCONFIG_TEST_VAR = 'present';
    const schema = z.object({ LOADCONFIG_TEST_VAR: z.string() });

    const result = loadConfig(schema);

    expect(result).toEqual({ LOADCONFIG_TEST_VAR: 'present' });
    delete process.env.LOADCONFIG_TEST_VAR;
  });

  describe('composable schema fragments (schemas.ts)', () => {
    it('nodeEnvSchema defaults NODE_ENV to "development" when absent', () => {
      const result = loadConfig(nodeEnvSchema, {});

      expect(result.NODE_ENV).toBe('development');
    });

    it('nodeEnvSchema rejects an unrecognized NODE_ENV value', () => {
      expect(() => loadConfig(nodeEnvSchema, { NODE_ENV: 'nonsense' })).toThrow(
        ConfigValidationError,
      );
    });

    it('databaseEnvSchema requires a valid DATABASE_URL', () => {
      expect(() => loadConfig(databaseEnvSchema, {})).toThrow(/DATABASE_URL/);

      const result = loadConfig(databaseEnvSchema, {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      });
      expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    });

    it('redisEnvSchema requires a valid REDIS_URL', () => {
      expect(() => loadConfig(redisEnvSchema, {})).toThrow(/REDIS_URL/);
    });

    it('fragments merge together into one composite schema, as a consuming app would', () => {
      const appSchema = nodeEnvSchema.merge(databaseEnvSchema).merge(redisEnvSchema);

      expect(() => loadConfig(appSchema, {})).toThrow(ConfigValidationError);

      const result = loadConfig(appSchema, {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
      });
      expect(result.NODE_ENV).toBe('development');
      expect(result.DATABASE_URL).toContain('postgresql://');
      expect(result.REDIS_URL).toContain('redis://');
    });
  });
});
