import { PushClientService } from './push-client.service.js';

describe('PushClientService', () => {
  it('constructs cleanly with a blank config — no real Firebase project in this environment', () => {
    expect(
      () =>
        new PushClientService({
          FCM_PROJECT_ID: undefined,
          FCM_CLIENT_EMAIL: undefined,
          FCM_PRIVATE_KEY: undefined,
        }),
    ).not.toThrow();
  });

  it('send() throws a clear, real error when actually invoked with no credentials configured', async () => {
    const service = new PushClientService({
      FCM_PROJECT_ID: undefined,
      FCM_CLIENT_EMAIL: undefined,
      FCM_PRIVATE_KEY: undefined,
    });

    await expect(service.send({ token: 'tok-1', title: 'Title', body: 'Body' })).rejects.toThrow(
      'FCM is not configured',
    );
  });

  it('constructs cleanly when only a partial config is present (still treated as unconfigured)', () => {
    expect(
      () =>
        new PushClientService({
          FCM_PROJECT_ID: 'my-project',
          FCM_CLIENT_EMAIL: undefined,
          FCM_PRIVATE_KEY: undefined,
        }),
    ).not.toThrow();
  });
});
