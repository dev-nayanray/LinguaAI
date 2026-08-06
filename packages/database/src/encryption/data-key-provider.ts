/**
 * Envelope-encryption data-key provider (ADR-029). `AIMessage.content` is
 * never encrypted directly under a long-lived master key; instead a
 * per-generation 32-byte data key is generated, used locally (AES-256-GCM,
 * `@linguaai/utils`) to encrypt/decrypt field values, and is itself
 * protected ("wrapped") by this provider so only the wrapped form is ever
 * persisted (`EncryptionDataKey.wrappedKey`).
 *
 * Two implementations, selected by `AI_MESSAGE_KMS_PROVIDER`:
 * - `AwsKmsDataKeyProvider` — real AWS KMS `GenerateDataKey`/`Decrypt`
 *   calls, matching ADR-029's decision text. Required in production.
 * - `LocalStubDataKeyProvider` — a stand-in for local dev/CI where no AWS
 *   credentials exist (the same constraint T1 hit). Explicitly never
 *   selected when `NODE_ENV=production` — see `getDataKeyProvider` below.
 */
export interface GeneratedDataKey {
  /** Raw 32-byte data key — held only in memory, never persisted. */
  plaintextKey: Buffer;
  /** The provider's wrapped (encrypted) form of `plaintextKey` — safe to persist. */
  wrappedKey: string;
  /** Which KMS key (or stub marker) produced this wrapping, for audit/debugging. */
  kmsKeyId: string | null;
}

export interface DataKeyProvider {
  readonly name: 'AWS_KMS' | 'LOCAL_STUB';
  generateDataKey(): Promise<GeneratedDataKey>;
  decryptDataKey(wrappedKey: string): Promise<Buffer>;
}
