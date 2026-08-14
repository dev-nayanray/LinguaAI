import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  identityPasswordResetRequestedPayloadSchema,
  identityUserRegisteredPayloadSchema,
} from '@linguaai/validation/identity';

/**
 * `assessment.service.ts`'s own established convention
 * (`../assessment/event-catalog-conformance.spec.ts`), applied here to
 * `AuthService`'s own two events — added at E16 T2 once
 * `notification-service` became a real consumer of both, giving these
 * event contracts the same schema-conformance proof every other real
 * consumer relationship in this codebase already has.
 */
describe('identity.user.registered event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`identity.user.registered`');
  });

  it('a representative real payload (password signup) satisfies the schema auth.service.ts builds its event from', () => {
    expect(() =>
      identityUserRegisteredPayloadSchema.parse({ signupSource: 'password' }),
    ).not.toThrow();
  });

  it('a representative real payload (OAuth signup) satisfies the same schema', () => {
    expect(() =>
      identityUserRegisteredPayloadSchema.parse({ signupSource: 'google' }),
    ).not.toThrow();
  });
});

describe('identity.password.reset_requested event conformance', () => {
  it('is registered in the EVENT_ARCHITECTURE.md catalog', () => {
    const catalogPath = join(__dirname, '../../../../../docs/EVENT_ARCHITECTURE.md');
    const catalog = readFileSync(catalogPath, 'utf-8');

    expect(catalog).toContain('`identity.password.reset_requested`');
  });

  it('a representative real payload satisfies the schema auth.service.ts builds its event from', () => {
    const payload = {
      resetTokenReference: '11111111-1111-1111-1111-111111111111',
      resetToken: 'a-real-base64url-encoded-token',
    };

    expect(() => identityPasswordResetRequestedPayloadSchema.parse(payload)).not.toThrow();
  });
});
