import type { S3Client } from '@aws-sdk/client-s3';

import { S3AudioStorageProvider, type S3AudioStorageConfig } from './s3-audio-storage.provider.js';

function fakeClient(send: jest.Mock = jest.fn().mockResolvedValue({})): S3Client {
  return { send } as unknown as S3Client;
}

const pathStyleConfig: S3AudioStorageConfig = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'linguaai-media',
  accessKeyId: 'linguaai',
  secretAccessKey: 'linguaai_dev_password',
  forcePathStyle: true,
};

describe('S3AudioStorageProvider', () => {
  it('constructs a real S3Client when none is injected', () => {
    expect(() => new S3AudioStorageProvider(pathStyleConfig)).not.toThrow();
  });

  it('uploads via PutObjectCommand and returns a path-style URL when forcePathStyle is true', async () => {
    const send = jest.fn().mockResolvedValue({});
    const provider = new S3AudioStorageProvider(pathStyleConfig, fakeClient(send));

    const result = await provider.upload({
      key: 'speaking-sessions/session-1/turn-1-user.webm',
      body: Buffer.from('audio bytes'),
      contentType: 'audio/webm',
    });

    expect(result).toEqual({
      url: 'http://localhost:9000/linguaai-media/speaking-sessions/session-1/turn-1-user.webm',
    });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as {
      input: {
        Bucket: string;
        Key: string;
        Body: Buffer;
        ContentType: string;
        ContentLength: number;
      };
    };
    expect(command.input).toEqual({
      Bucket: 'linguaai-media',
      Key: 'speaking-sessions/session-1/turn-1-user.webm',
      Body: Buffer.from('audio bytes'),
      ContentType: 'audio/webm',
      ContentLength: 11,
    });
  });

  it('returns a virtual-hosted-style URL when forcePathStyle is false', async () => {
    const config: S3AudioStorageConfig = {
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'linguaai-media',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: false,
    };
    const provider = new S3AudioStorageProvider(config, fakeClient());

    const result = await provider.upload({
      key: 'speaking-sessions/session-1/turn-1-assistant.mp3',
      body: Buffer.from('audio'),
      contentType: 'audio/mpeg',
    });

    expect(result).toEqual({
      url: 'https://linguaai-media.s3.us-east-1.amazonaws.com/speaking-sessions/session-1/turn-1-assistant.mp3',
    });
  });
});
