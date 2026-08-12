import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type {
  AudioStorageProvider,
  AudioUploadInput,
  AudioUploadResult,
} from './audio-storage.interface.js';

export interface S3AudioStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Real S3-compatible upload (E10 T4, ADR-047) — works against both MinIO
 * (local dev, path-style addressing) and real AWS S3 (production,
 * virtual-hosted-style) via the same `forcePathStyle` flag the AWS SDK
 * itself already exposes for exactly this distinction.
 *
 * `AudioUploadResult.url` is a stable, non-expiring reference (not a
 * time-limited presigned URL) — deliberate, since `AIMessage.audioUrl` is a
 * plain, permanently-stored `String?` column with no companion expiry/key
 * field this task's own scope doesn't add. This is a real, flagged
 * consequence (ADR-047, RISK_REGISTER): the bucket `docker-compose.yml`'s
 * own `minio-init` step creates is private by default, so today's stored
 * URLs are not actually fetchable by an end-user client without a future
 * signed-URL-on-read serving layer — a real, separate, tracked follow-up,
 * not silently declared solved here.
 */
export class S3AudioStorageProvider implements AudioStorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3AudioStorageConfig,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async upload(input: AudioUploadInput): Promise<AudioUploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.byteLength,
      }),
    );
    return { url: this.buildObjectUrl(input.key) };
  }

  private buildObjectUrl(key: string): string {
    const endpoint = this.config.endpoint.replace(/\/$/, '');
    return this.config.forcePathStyle
      ? `${endpoint}/${this.config.bucket}/${key}`
      : `${new URL(endpoint).protocol}//${this.config.bucket}.${new URL(endpoint).host}/${key}`;
  }
}
