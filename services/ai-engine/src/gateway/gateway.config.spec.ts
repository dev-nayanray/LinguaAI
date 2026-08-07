import { resolveAiGatewayConfig } from './gateway.config.js';

describe('resolveAiGatewayConfig', () => {
  const requiredEnv = {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENAI_API_KEY: 'sk-oai-test',
    AI_MODEL_TEACHER_DEFAULT: 'claude-teacher',
    AI_MODEL_ASSESSMENT_DEFAULT: 'claude-assessment',
    AI_MODEL_CONTENT_DEFAULT: 'claude-content',
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
      contentModel: 'claude-content',
      teacherEconomyModel: undefined,
      assessmentEconomyModel: undefined,
      contentEconomyModel: undefined,
    });
  });

  it('maps optional economy-tier model env vars when configured', () => {
    process.env.AI_MODEL_TEACHER_ECONOMY = 'claude-teacher-economy';
    process.env.AI_MODEL_ASSESSMENT_ECONOMY = 'claude-assessment-economy';
    process.env.AI_MODEL_CONTENT_ECONOMY = 'claude-content-economy';

    const config = resolveAiGatewayConfig();

    expect(config.teacherEconomyModel).toBe('claude-teacher-economy');
    expect(config.assessmentEconomyModel).toBe('claude-assessment-economy');
    expect(config.contentEconomyModel).toBe('claude-content-economy');
  });

  it("treats an explicitly blank economy-tier env var (.env.example's own documented convention for an unset optional) as not configured, not a validation error", () => {
    process.env.AI_MODEL_TEACHER_ECONOMY = '';
    process.env.AI_MODEL_ASSESSMENT_ECONOMY = '';
    process.env.AI_MODEL_CONTENT_ECONOMY = '';

    expect(() => resolveAiGatewayConfig()).not.toThrow();
    expect(resolveAiGatewayConfig().teacherEconomyModel).toBeUndefined();
    expect(resolveAiGatewayConfig().contentEconomyModel).toBeUndefined();
  });

  it('throws (fail-fast) when a required var is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => resolveAiGatewayConfig()).toThrow();
  });
});
