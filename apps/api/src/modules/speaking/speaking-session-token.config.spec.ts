import { resolveSpeechSessionTokenConfig } from './speaking-session-token.config.js';

describe('resolveSpeechSessionTokenConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the validated SPEECH_SESSION_TOKEN_SECRET', () => {
    process.env = { ...originalEnv, SPEECH_SESSION_TOKEN_SECRET: 'shared-secret-test' };

    expect(resolveSpeechSessionTokenConfig()).toEqual({ secret: 'shared-secret-test' });
  });

  it('throws (fail-fast) when SPEECH_SESSION_TOKEN_SECRET is missing', () => {
    process.env = { ...originalEnv };
    delete process.env.SPEECH_SESSION_TOKEN_SECRET;

    expect(() => resolveSpeechSessionTokenConfig()).toThrow();
  });
});
