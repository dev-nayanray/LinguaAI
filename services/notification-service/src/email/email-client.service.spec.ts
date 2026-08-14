import nodemailer from 'nodemailer';

import { EmailClientService } from './email-client.service.js';

jest.mock('nodemailer');

describe('EmailClientService', () => {
  const sendMail = jest.fn();
  const createTransport = nodemailer.createTransport as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    createTransport.mockReturnValue({ sendMail });
  });

  function makeService(overrides: Partial<Record<string, unknown>> = {}): EmailClientService {
    return new EmailClientService({
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      EMAIL_FROM: 'hello@linguaai.app',
      ...overrides,
    } as never);
  }

  it('configures the SMTP transport from EmailEnv, with no auth block when SMTP_USER is unset (MailHog needs none)', () => {
    makeService();

    expect(createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      auth: undefined,
    });
  });

  it('configures an auth block when SMTP_USER is set', () => {
    makeService({ SMTP_USER: 'user', SMTP_PASSWORD: 'pass' });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      auth: { user: 'user', pass: 'pass' },
    });
  });

  it('sends an email with the configured from address and the given params', async () => {
    sendMail.mockResolvedValue(undefined);
    const service = makeService();

    await service.send({
      to: 'learner@test.local',
      subject: 'Welcome',
      html: '<p>Welcome</p>',
      text: 'Welcome',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'hello@linguaai.app',
      to: 'learner@test.local',
      subject: 'Welcome',
      html: '<p>Welcome</p>',
      text: 'Welcome',
    });
  });

  it('propagates a real SMTP failure — never silently swallowed here (the caller decides how to log it)', async () => {
    sendMail.mockRejectedValue(new Error('Connection refused'));
    const service = makeService();

    await expect(
      service.send({ to: 'learner@test.local', subject: 'Welcome', html: '<p/>', text: 'x' }),
    ).rejects.toThrow('Connection refused');
  });
});
