import { signSpeechSessionToken } from '@linguaai/utils';

import { SessionTokenService } from './session-token.service.js';

describe('SessionTokenService', () => {
  it('verifies a token signed with the same secret for its own sessionId', () => {
    const service = new SessionTokenService({ secret: 'shared-secret' });
    const token = signSpeechSessionToken(
      { sessionId: 'session-1', userId: 'user-1' },
      'shared-secret',
    );

    const result = service.verify(token, 'session-1');

    expect(result).toEqual({
      valid: true,
      claims: { sessionId: 'session-1', userId: 'user-1' },
    });
  });

  it('rejects a token signed with a different secret', () => {
    const service = new SessionTokenService({ secret: 'shared-secret' });
    const token = signSpeechSessionToken(
      { sessionId: 'session-1', userId: 'user-1' },
      'a-different-secret',
    );

    const result = service.verify(token, 'session-1');

    expect(result).toEqual({ valid: false, reason: 'invalid-signature' });
  });
});
