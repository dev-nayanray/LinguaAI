import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigValidationError } from './errors.js';
import { loadConfig } from './load-config.js';
import {
  aiEngineClientEnvSchema,
  aiGatewayEnvSchema,
  appRoleDatabaseEnvSchema,
  databaseEnvSchema,
  nodeEnvSchema,
  objectStorageEnvSchema,
  redisEnvSchema,
  speechProviderEnvSchema,
  speechSessionTokenEnvSchema,
} from './schemas.js';

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

    it('appRoleDatabaseEnvSchema requires a valid APP_DATABASE_URL but not APP_SERVICE_ROLE_DATABASE_URL', () => {
      expect(() => loadConfig(appRoleDatabaseEnvSchema, {})).toThrow(/APP_DATABASE_URL/);

      const result = loadConfig(appRoleDatabaseEnvSchema, {
        APP_DATABASE_URL: 'postgresql://app_role:pass@localhost:5432/db',
      });
      expect(result).toEqual({ APP_DATABASE_URL: 'postgresql://app_role:pass@localhost:5432/db' });
    });

    it('aiGatewayEnvSchema defaults AI_GATEWAY_DEFAULT_PROVIDER to "anthropic" but still requires both API keys and all three model vars', () => {
      expect(() => loadConfig(aiGatewayEnvSchema, {})).toThrow(ConfigValidationError);

      const result = loadConfig(aiGatewayEnvSchema, {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        OPENAI_API_KEY: 'sk-oai-test',
        AI_MODEL_TEACHER_DEFAULT: 'claude-sonnet-5',
        AI_MODEL_ASSESSMENT_DEFAULT: 'claude-sonnet-5',
        AI_MODEL_CONTENT_DEFAULT: 'claude-sonnet-5',
      });
      expect(result.AI_GATEWAY_DEFAULT_PROVIDER).toBe('anthropic');
    });

    it('aiGatewayEnvSchema treats an explicitly blank economy-model env var as not configured, not a validation error', () => {
      const result = loadConfig(aiGatewayEnvSchema, {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        OPENAI_API_KEY: 'sk-oai-test',
        AI_MODEL_TEACHER_DEFAULT: 'claude-sonnet-5',
        AI_MODEL_ASSESSMENT_DEFAULT: 'claude-sonnet-5',
        AI_MODEL_CONTENT_DEFAULT: 'claude-sonnet-5',
        AI_MODEL_TEACHER_ECONOMY: '',
      });
      expect(result.AI_MODEL_TEACHER_ECONOMY).toBeUndefined();
    });

    it('aiGatewayEnvSchema rejects an unrecognized provider value', () => {
      expect(() =>
        loadConfig(aiGatewayEnvSchema, {
          AI_GATEWAY_DEFAULT_PROVIDER: 'someoneelse',
          ANTHROPIC_API_KEY: 'sk-ant-test',
          OPENAI_API_KEY: 'sk-oai-test',
          AI_MODEL_TEACHER_DEFAULT: 'claude-sonnet-5',
          AI_MODEL_ASSESSMENT_DEFAULT: 'claude-sonnet-5',
          AI_MODEL_CONTENT_DEFAULT: 'claude-sonnet-5',
        }),
      ).toThrow(ConfigValidationError);
    });

    it('aiEngineClientEnvSchema requires a valid AI_ENGINE_URL', () => {
      expect(() => loadConfig(aiEngineClientEnvSchema, {})).toThrow(/AI_ENGINE_URL/);

      const result = loadConfig(aiEngineClientEnvSchema, {
        AI_ENGINE_URL: 'http://localhost:4001',
      });
      expect(result.AI_ENGINE_URL).toBe('http://localhost:4001');
    });

    it('speechSessionTokenEnvSchema requires SPEECH_SESSION_TOKEN_SECRET', () => {
      expect(() => loadConfig(speechSessionTokenEnvSchema, {})).toThrow(
        /SPEECH_SESSION_TOKEN_SECRET/,
      );

      const result = loadConfig(speechSessionTokenEnvSchema, {
        SPEECH_SESSION_TOKEN_SECRET: 'a-real-secret',
      });
      expect(result.SPEECH_SESSION_TOKEN_SECRET).toBe('a-real-secret');
    });

    it('speechProviderEnvSchema requires OPENAI_API_KEY', () => {
      expect(() => loadConfig(speechProviderEnvSchema, {})).toThrow(/OPENAI_API_KEY/);

      const result = loadConfig(speechProviderEnvSchema, { OPENAI_API_KEY: 'sk-test' });
      expect(result.OPENAI_API_KEY).toBe('sk-test');
    });

    it('objectStorageEnvSchema requires every S3 var and defaults S3_FORCE_PATH_STYLE to false', () => {
      expect(() => loadConfig(objectStorageEnvSchema, {})).toThrow(/S3_ENDPOINT/);

      const result = loadConfig(objectStorageEnvSchema, {
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'linguaai-media',
        S3_ACCESS_KEY_ID: 'linguaai',
        S3_SECRET_ACCESS_KEY: 'linguaai_dev_password',
      });
      expect(result.S3_FORCE_PATH_STYLE).toBe(false);
    });

    it('objectStorageEnvSchema parses S3_FORCE_PATH_STYLE="true" to a real boolean', () => {
      const result = loadConfig(objectStorageEnvSchema, {
        S3_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'linguaai-media',
        S3_ACCESS_KEY_ID: 'linguaai',
        S3_SECRET_ACCESS_KEY: 'linguaai_dev_password',
        S3_FORCE_PATH_STYLE: 'true',
      });
      expect(result.S3_FORCE_PATH_STYLE).toBe(true);
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
