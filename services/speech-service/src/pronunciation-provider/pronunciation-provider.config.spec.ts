import { resolvePronunciationProviderConfig } from './pronunciation-provider.config.js';

describe('resolvePronunciationProviderConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AZURE_SPEECH_KEY: 'azure-test-key',
      AZURE_SPEECH_REGION: 'eastus',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maps the validated AZURE_SPEECH_KEY/AZURE_SPEECH_REGION env vars to the module config shape', () => {
    expect(resolvePronunciationProviderConfig()).toEqual({
      azureSpeechKey: 'azure-test-key',
      azureSpeechRegion: 'eastus',
    });
  });

  it('throws (fail-fast) when AZURE_SPEECH_KEY is missing', () => {
    delete process.env.AZURE_SPEECH_KEY;

    expect(() => resolvePronunciationProviderConfig()).toThrow();
  });

  it('throws (fail-fast) when AZURE_SPEECH_REGION is missing', () => {
    delete process.env.AZURE_SPEECH_REGION;

    expect(() => resolvePronunciationProviderConfig()).toThrow();
  });
});
