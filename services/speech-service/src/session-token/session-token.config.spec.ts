import { resolveSessionTokenConfig } from './session-token.config.js';

describe('resolveSessionTokenConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SPEECH_SESSION_TOKEN_SECRET: 'shared-secret-test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maps the validated SPEECH_SESSION_TOKEN_SECRET env var to the module config shape', () => {
    expect(resolveSessionTokenConfig()).toEqual({ secret: 'shared-secret-test' });
  });

  it('throws (fail-fast) when SPEECH_SESSION_TOKEN_SECRET is missing', () => {
    delete process.env.SPEECH_SESSION_TOKEN_SECRET;

    expect(() => resolveSessionTokenConfig()).toThrow();
  });
});
