import { Inject, Injectable } from '@nestjs/common';
import type { EmailEnv } from '@linguaai/config';
import nodemailer, { type Transporter } from 'nodemailer';

import { EMAIL_CONFIG } from './email.constants.js';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Thin wrapper around `nodemailer`'s SMTP transport (E16 T2, design doc
 * §3.2) — the real external-delivery boundary, deliberately isolated behind
 * its own `Injectable` so e2e tests can `overrideProvider(EmailClientService)`
 * with a mocked transport where MailHog itself isn't the thing under test,
 * the same "mock the boundary, not the module" precedent `StripeClientService`
 * already established (E15). Respects `.env`'s own already-committed
 * `EMAIL_PROVIDER=smtp` — no other provider branch exists, since none is
 * configured (`emailEnvSchema`'s own doc comment).
 *
 * Throws on a real SMTP failure — never silently swallowed here.
 * `NotificationDispatcher` is the layer that catches it and writes a real
 * `FAILED` `NotificationLog` row with `failureReason`, matching this
 * codebase's own "log the outcome, don't hide the failure" discipline
 * (`DailyGoalBatchRunner`'s own per-plan catch-and-log precedent).
 */
@Injectable()
export class EmailClientService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(EMAIL_CONFIG) config: EmailEnv) {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    });
    this.from = config.EMAIL_FROM;
  }

  async send(params: SendEmailParams): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
  }
}
