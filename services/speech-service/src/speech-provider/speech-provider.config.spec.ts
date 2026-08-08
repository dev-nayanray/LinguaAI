import { resolveSpeechProviderConfig } from './speech-provider.config.js';

describe('resolveSpeechProviderConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'sk-oai-test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maps the validated OPENAI_API_KEY env var to the module config shape', () => {
    expect(resolveSpeechProviderConfig()).toEqual({ openAiApiKey: 'sk-oai-test' });
  });

  it('throws (fail-fast) when OPENAI_API_KEY is missing', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => resolveSpeechProviderConfig()).toThrow();
  });
});
