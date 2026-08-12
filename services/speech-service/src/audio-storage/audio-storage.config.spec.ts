import { resolveAudioStorageConfig } from './audio-storage.config.js';

describe('resolveAudioStorageConfig', () => {
  const originalEnv = process.env;
  const validEnv = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'linguaai-media',
    S3_ACCESS_KEY_ID: 'linguaai',
    S3_SECRET_ACCESS_KEY: 'linguaai_dev_password',
  };

  beforeEach(() => {
    process.env = { ...originalEnv, ...validEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maps the validated S3 env vars to the module config shape, defaulting forcePathStyle to false', () => {
    expect(resolveAudioStorageConfig()).toEqual({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'linguaai-media',
      accessKeyId: 'linguaai',
      secretAccessKey: 'linguaai_dev_password',
      forcePathStyle: false,
    });
  });

  it('parses S3_FORCE_PATH_STYLE="true" to forcePathStyle: true', () => {
    process.env.S3_FORCE_PATH_STYLE = 'true';

    expect(resolveAudioStorageConfig().forcePathStyle).toBe(true);
  });

  it('throws (fail-fast) when S3_BUCKET is missing', () => {
    delete process.env.S3_BUCKET;

    expect(() => resolveAudioStorageConfig()).toThrow();
  });
});
