import { resolveEmailConfig } from './email.config.js';

describe('resolveEmailConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the validated email config, matching .env's own real MailHog defaults", () => {
    process.env = {
      ...originalEnv,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      EMAIL_FROM: 'hello@linguaai.app',
    };

    expect(resolveEmailConfig()).toEqual({
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      EMAIL_FROM: 'hello@linguaai.app',
    });
  });

  it('throws (fail-fast) when SMTP_HOST is missing', () => {
    process.env = {
      ...originalEnv,
      EMAIL_PROVIDER: 'smtp',
      SMTP_PORT: '1025',
      EMAIL_FROM: 'hello@linguaai.app',
    };
    delete process.env.SMTP_HOST;

    expect(() => resolveEmailConfig()).toThrow();
  });

  it('throws when EMAIL_PROVIDER is not "smtp" — the only value ever configured', () => {
    process.env = {
      ...originalEnv,
      EMAIL_PROVIDER: 'sendgrid',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      EMAIL_FROM: 'hello@linguaai.app',
    };

    expect(() => resolveEmailConfig()).toThrow();
  });
});
