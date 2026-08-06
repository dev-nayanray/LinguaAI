import { AwsKmsDataKeyProvider } from './aws-kms-data-key-provider.js';
import type { DataKeyProvider } from './data-key-provider.js';
import { LocalStubDataKeyProvider } from './local-stub-data-key-provider.js';

let providerSingleton: DataKeyProvider | undefined;

/**
 * Selects the envelope-encryption provider for `AIMessage.content`
 * (ADR-029). `AI_MESSAGE_KMS_PROVIDER` defaults to `local-stub` so local
 * dev/test/CI work without AWS credentials, but production must set it to
 * `aws` explicitly — a missing/wrong value in production fails closed
 * (throws) rather than silently encrypting learner conversation data
 * under a dev-only stand-in key.
 */
export function getDataKeyProvider(): DataKeyProvider {
  if (providerSingleton) return providerSingleton;

  const providerName = process.env['AI_MESSAGE_KMS_PROVIDER'] ?? 'local-stub';

  if (process.env['NODE_ENV'] === 'production' && providerName !== 'aws') {
    throw new Error(`AI_MESSAGE_KMS_PROVIDER must be "aws" in production, got "${providerName}"`);
  }

  if (providerName === 'aws') {
    const keyId = process.env['AI_MESSAGE_KMS_KEY_ID'];
    if (!keyId) {
      throw new Error('AI_MESSAGE_KMS_KEY_ID is required when AI_MESSAGE_KMS_PROVIDER=aws');
    }
    providerSingleton = new AwsKmsDataKeyProvider(keyId);
    return providerSingleton;
  }

  if (providerName === 'local-stub') {
    const masterKey = process.env['AI_MESSAGE_LOCAL_STUB_MASTER_KEY'];
    if (!masterKey) {
      throw new Error(
        'AI_MESSAGE_LOCAL_STUB_MASTER_KEY is required when AI_MESSAGE_KMS_PROVIDER=local-stub (generate with `openssl rand -base64 32`)',
      );
    }
    providerSingleton = new LocalStubDataKeyProvider(masterKey);
    return providerSingleton;
  }

  throw new Error(`Unknown AI_MESSAGE_KMS_PROVIDER: "${providerName}"`);
}

/** Test-only: clears the singleton so the next getDataKeyProvider() call re-reads env vars. */
export function _resetDataKeyProviderForTesting(): void {
  providerSingleton = undefined;
}
