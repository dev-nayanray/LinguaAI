import { resolveDatabaseConfig } from './database.config.js';

describe('resolveDatabaseConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the validated APP_DATABASE_URL', () => {
    process.env = {
      ...originalEnv,
      APP_DATABASE_URL: 'postgresql://app_role:pw@localhost:5432/linguaai',
    };

    expect(resolveDatabaseConfig()).toEqual({
      APP_DATABASE_URL: 'postgresql://app_role:pw@localhost:5432/linguaai',
    });
  });

  it('throws (fail-fast) when APP_DATABASE_URL is missing', () => {
    process.env = { ...originalEnv };
    delete process.env.APP_DATABASE_URL;

    expect(() => resolveDatabaseConfig()).toThrow();
  });

  it('does not require APP_SERVICE_ROLE_DATABASE_URL — analytics-service has no BYPASSRLS use case', () => {
    process.env = {
      ...originalEnv,
      APP_DATABASE_URL: 'postgresql://app_role:pw@localhost:5432/linguaai',
    };
    delete process.env.APP_SERVICE_ROLE_DATABASE_URL;

    expect(() => resolveDatabaseConfig()).not.toThrow();
  });
});
