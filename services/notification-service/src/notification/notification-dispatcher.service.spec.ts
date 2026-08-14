import type { DomainEvent } from '@linguaai/events';

import { NotificationDispatcher } from './notification-dispatcher.service.js';

function makeEvent(
  type: string,
  payload: Record<string, unknown>,
  userId: string | null = 'user-1',
): DomainEvent {
  return {
    eventId: 'evt-1',
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    producedBy: 'apps/api',
    tenantId: null,
    userId,
    payload,
  };
}

describe('NotificationDispatcher', () => {
  const findUnique = jest.fn();
  const create = jest.fn();
  const prisma = {
    user: { findUnique },
    notificationLog: { create },
  } as never;
  const isOptedIn = jest.fn();
  const preferences = { isOptedIn } as never;
  const send = jest.fn();
  const emailClient = { send } as never;
  const serverUrlConfig: { APP_URL: string | undefined } = { APP_URL: 'https://app.linguaai.test' };

  function makeDispatcher(url = serverUrlConfig): NotificationDispatcher {
    return new NotificationDispatcher(prisma, url as never, preferences, emailClient);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({});
  });

  describe('identity.user.registered', () => {
    it('skips with no userId', async () => {
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.user.registered',
        makeEvent('identity.user.registered', { signupSource: 'password' }, null),
      );

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('throws on a malformed payload — never silently skipped', async () => {
      const dispatcher = makeDispatcher();

      await expect(
        dispatcher.dispatch('identity.user.registered', makeEvent('identity.user.registered', {})),
      ).rejects.toThrow();
    });

    it('skips when no User row exists for the userId', async () => {
      findUnique.mockResolvedValue(null);
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.user.registered',
        makeEvent('identity.user.registered', { signupSource: 'password' }),
      );

      expect(send).not.toHaveBeenCalled();
    });

    it('suppresses (no send, no log row) when the user opted out of SYSTEM/EMAIL', async () => {
      findUnique.mockResolvedValue({ id: 'user-1', email: 'a@test.local', displayName: 'A' });
      isOptedIn.mockResolvedValue(false);
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.user.registered',
        makeEvent('identity.user.registered', { signupSource: 'password' }),
      );

      expect(send).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('sends a real welcome email and writes a SENT NotificationLog row when opted in', async () => {
      findUnique.mockResolvedValue({ id: 'user-1', email: 'a@test.local', displayName: 'A' });
      isOptedIn.mockResolvedValue(true);
      send.mockResolvedValue(undefined);
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.user.registered',
        makeEvent('identity.user.registered', { signupSource: 'password' }),
      );

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@test.local',
          subject: expect.any(String) as unknown as string,
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            channel: 'EMAIL',
            type: 'SYSTEM',
            status: 'SENT',
          }),
        }),
      );
    });

    it('writes a FAILED NotificationLog row and rethrows on a real SMTP failure', async () => {
      findUnique.mockResolvedValue({ id: 'user-1', email: 'a@test.local', displayName: 'A' });
      isOptedIn.mockResolvedValue(true);
      send.mockRejectedValue(new Error('Connection refused'));
      const dispatcher = makeDispatcher();

      await expect(
        dispatcher.dispatch(
          'identity.user.registered',
          makeEvent('identity.user.registered', { signupSource: 'password' }),
        ),
      ).rejects.toThrow('Connection refused');

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', failureReason: 'Connection refused' }),
        }),
      );
    });
  });

  describe('identity.password.reset_requested', () => {
    it('skips with no userId', async () => {
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.password.reset_requested',
        makeEvent(
          'identity.password.reset_requested',
          { resetTokenReference: '11111111-1111-1111-1111-111111111111', resetToken: 'x' },
          null,
        ),
      );

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('skips when no User row exists for the userId', async () => {
      findUnique.mockResolvedValue(null);
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.password.reset_requested',
        makeEvent('identity.password.reset_requested', {
          resetTokenReference: '11111111-1111-1111-1111-111111111111',
          resetToken: 'x',
        }),
      );

      expect(send).not.toHaveBeenCalled();
    });

    it('never checks NotificationPreference — §3.5 security-critical carve-out', async () => {
      findUnique.mockResolvedValue({ id: 'user-1', email: 'a@test.local', displayName: 'A' });
      send.mockResolvedValue(undefined);
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.password.reset_requested',
        makeEvent('identity.password.reset_requested', {
          resetTokenReference: '11111111-1111-1111-1111-111111111111',
          resetToken: 'raw-token-value',
        }),
      );

      expect(isOptedIn).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@test.local',
          html: expect.stringContaining('raw-token-value') as unknown as string,
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'SECURITY_ALERT', status: 'SENT' }),
        }),
      );
    });

    it("builds the reset link against APP_URL and the raw resetToken, matching the web app's own /password-reset/confirm?token= contract", async () => {
      findUnique.mockResolvedValue({ id: 'user-1', email: 'a@test.local', displayName: 'A' });
      send.mockResolvedValue(undefined);
      const dispatcher = makeDispatcher();

      await dispatcher.dispatch(
        'identity.password.reset_requested',
        makeEvent('identity.password.reset_requested', {
          resetTokenReference: '11111111-1111-1111-1111-111111111111',
          resetToken: 'raw-token-value',
        }),
      );

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://app.linguaai.test/password-reset/confirm?token=raw-token-value',
          ) as unknown as string,
        }),
      );
    });

    it('throws a clear, fail-loud error when APP_URL is not configured — never sends a broken link', async () => {
      findUnique.mockResolvedValue({ id: 'user-1', email: 'a@test.local', displayName: 'A' });
      const dispatcher = makeDispatcher({ APP_URL: undefined });

      await expect(
        dispatcher.dispatch(
          'identity.password.reset_requested',
          makeEvent('identity.password.reset_requested', {
            resetTokenReference: '11111111-1111-1111-1111-111111111111',
            resetToken: 'raw-token-value',
          }),
        ),
      ).rejects.toThrow('APP_URL is not configured');
      expect(send).not.toHaveBeenCalled();
    });

    it('throws on a malformed payload (missing resetToken)', async () => {
      const dispatcher = makeDispatcher();

      await expect(
        dispatcher.dispatch(
          'identity.password.reset_requested',
          makeEvent('identity.password.reset_requested', {
            resetTokenReference: '11111111-1111-1111-1111-111111111111',
          }),
        ),
      ).rejects.toThrow();
    });
  });

  it('is a real no-op for every other event type — this consumer sees every event on its own queue regardless of relevance', async () => {
    const dispatcher = makeDispatcher();

    await dispatcher.dispatch(
      'assessment.attempt.completed',
      makeEvent('assessment.attempt.completed', {}),
    );

    expect(findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
