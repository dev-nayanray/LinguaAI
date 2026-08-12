/**
 * The adapter every object-storage backend is integrated behind (E10 T4,
 * ADR-047) — mirrors `SttProvider`/`TtsProvider`'s own adapter-interface
 * precedent (`speech-provider.interface.ts`, ADR-006), extended here from
 * speech providers to object storage: no application code calls an AWS SDK
 * client directly.
 */
export interface AudioUploadInput {
  /** Object key within the configured bucket — the caller owns key naming (e.g. `speaking-sessions/<sessionId>/<turn>-user.webm`). */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface AudioUploadResult {
  /** The real, publicly-fetchable URL of the uploaded object. */
  url: string;
}

export interface AudioStorageProvider {
  upload(input: AudioUploadInput): Promise<AudioUploadResult>;
}
