import { resolveSpeechServiceClientConfig } from './speech-service-client.config.js';

describe('resolveSpeechServiceClientConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the validated SPEECH_SERVICE_URL', () => {
    process.env = { ...originalEnv, SPEECH_SERVICE_URL: 'http://localhost:4002' };

    expect(resolveSpeechServiceClientConfig()).toEqual({
      SPEECH_SERVICE_URL: 'http://localhost:4002',
    });
  });

  it('throws (fail-fast) when SPEECH_SERVICE_URL is missing', () => {
    process.env = { ...originalEnv };
    delete process.env.SPEECH_SERVICE_URL;

    expect(() => resolveSpeechServiceClientConfig()).toThrow();
  });
});
