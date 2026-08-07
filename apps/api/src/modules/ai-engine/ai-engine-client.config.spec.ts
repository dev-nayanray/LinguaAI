import { resolveAiEngineClientConfig } from './ai-engine-client.config.js';

describe('resolveAiEngineClientConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the validated AI_ENGINE_URL', () => {
    process.env = { ...originalEnv, AI_ENGINE_URL: 'http://localhost:4001' };

    expect(resolveAiEngineClientConfig()).toEqual({ AI_ENGINE_URL: 'http://localhost:4001' });
  });

  it('throws (fail-fast) when AI_ENGINE_URL is missing', () => {
    process.env = { ...originalEnv };
    delete process.env.AI_ENGINE_URL;

    expect(() => resolveAiEngineClientConfig()).toThrow();
  });
});
