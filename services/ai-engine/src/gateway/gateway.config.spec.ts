import { resolveAiGatewayConfig } from './gateway.config.js';

describe('resolveAiGatewayConfig', () => {
  const requiredEnv = {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENAI_API_KEY: 'sk-oai-test',
    AI_MODEL_TEACHER_DEFAULT: 'claude-teacher',
    AI_MODEL_ASSESSMENT_DEFAULT: 'claude-assessment',
  };
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ...requiredEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('maps validated env vars to the narrower RouterService-facing config shape', () => {
    process.env.AI_GATEWAY_DEFAULT_PROVIDER = 'openai';

    const config = resolveAiGatewayConfig();

    expect(config).toEqual({
      defaultProvider: 'openai',
      anthropicApiKey: 'sk-ant-test',
      openAiApiKey: 'sk-oai-test',
      teacherModel: 'claude-teacher',
      assessmentModel: 'claude-assessment',
    });
  });

  it('throws (fail-fast) when a required var is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => resolveAiGatewayConfig()).toThrow();
  });
});
