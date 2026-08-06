import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AwsKmsDataKeyProvider } from './aws-kms-data-key-provider.js';
import { _resetDataKeyProviderForTesting, getDataKeyProvider } from './get-data-key-provider.js';
import { LocalStubDataKeyProvider } from './local-stub-data-key-provider.js';

const originalEnv = { ...process.env };
const validMasterKey = randomBytes(32).toString('base64');

function resetEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('getDataKeyProvider', () => {
  beforeEach(() => {
    _resetDataKeyProviderForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetDataKeyProviderForTesting();
  });

  it('defaults to LOCAL_STUB when AI_MESSAGE_KMS_PROVIDER is unset', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: undefined,
      NODE_ENV: 'test',
      AI_MESSAGE_LOCAL_STUB_MASTER_KEY: validMasterKey,
    });

    const provider = getDataKeyProvider();

    expect(provider).toBeInstanceOf(LocalStubDataKeyProvider);
  });

  it('selects AwsKmsDataKeyProvider when AI_MESSAGE_KMS_PROVIDER=aws and a key id is set', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'aws',
      NODE_ENV: 'test',
      AI_MESSAGE_KMS_KEY_ID: 'key-123',
    });

    const provider = getDataKeyProvider();

    expect(provider).toBeInstanceOf(AwsKmsDataKeyProvider);
  });

  it('throws if AI_MESSAGE_KMS_PROVIDER=aws but no key id is configured', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'aws',
      NODE_ENV: 'test',
      AI_MESSAGE_KMS_KEY_ID: undefined,
    });

    expect(() => getDataKeyProvider()).toThrow('AI_MESSAGE_KMS_KEY_ID is required');
  });

  it('throws if AI_MESSAGE_KMS_PROVIDER=local-stub but no master key is configured', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'local-stub',
      NODE_ENV: 'test',
      AI_MESSAGE_LOCAL_STUB_MASTER_KEY: undefined,
    });

    expect(() => getDataKeyProvider()).toThrow('AI_MESSAGE_LOCAL_STUB_MASTER_KEY is required');
  });

  it('throws for an unrecognized provider name', () => {
    resetEnv({ AI_MESSAGE_KMS_PROVIDER: 'something-else', NODE_ENV: 'test' });

    expect(() => getDataKeyProvider()).toThrow('Unknown AI_MESSAGE_KMS_PROVIDER: "something-else"');
  });

  it('fails closed in production if the provider is anything other than "aws" — never silently encrypts real conversation data under the dev stand-in key', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'local-stub',
      NODE_ENV: 'production',
      AI_MESSAGE_LOCAL_STUB_MASTER_KEY: validMasterKey,
    });

    expect(() => getDataKeyProvider()).toThrow(
      'AI_MESSAGE_KMS_PROVIDER must be "aws" in production',
    );
  });

  it('allows "aws" in production with a real key id configured', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'aws',
      NODE_ENV: 'production',
      AI_MESSAGE_KMS_KEY_ID: 'key-123',
    });

    expect(() => getDataKeyProvider()).not.toThrow();
  });

  it('caches the provider as a singleton — a second call returns the exact same instance, not a fresh one re-reading env', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'local-stub',
      NODE_ENV: 'test',
      AI_MESSAGE_LOCAL_STUB_MASTER_KEY: validMasterKey,
    });

    const first = getDataKeyProvider();
    const second = getDataKeyProvider();

    expect(first).toBe(second);
  });

  it('_resetDataKeyProviderForTesting clears the singleton so the next call re-reads env', () => {
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'local-stub',
      NODE_ENV: 'test',
      AI_MESSAGE_LOCAL_STUB_MASTER_KEY: validMasterKey,
    });
    const first = getDataKeyProvider();

    _resetDataKeyProviderForTesting();
    resetEnv({
      AI_MESSAGE_KMS_PROVIDER: 'aws',
      NODE_ENV: 'test',
      AI_MESSAGE_KMS_KEY_ID: 'key-123',
    });
    const second = getDataKeyProvider();

    expect(first).not.toBe(second);
    expect(second).toBeInstanceOf(AwsKmsDataKeyProvider);
  });
});
