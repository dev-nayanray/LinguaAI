import { Inject, Injectable } from '@nestjs/common';
import type { PushEnv } from '@linguaai/config';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { PUSH_CONFIG } from './push.constants.js';

export interface SendPushParams {
  token: string;
  title: string;
  body: string;
}

/**
 * Thin wrapper around `firebase-admin`'s FCM HTTP v1 messaging API (E21 T4,
 * design doc §6.4) — the real external-delivery boundary, deliberately
 * isolated behind its own `Injectable` so e2e tests can
 * `overrideProvider(PushClientService)`, the same "mock the boundary, not
 * the module" precedent `EmailClientService` (E16 T2) and `StripeClientService`
 * (E15) already established.
 *
 * No real Firebase project exists in this environment (a real, tracked
 * blocker mirroring RISK_REGISTER R-88's own "credential-less environment"
 * precedent for `ai-engine`'s e2e suite) — `admin.initializeApp` is only
 * ever called when `FCM_PROJECT_ID` is actually present, so this service
 * (and the app booting it) never crashes on a blank config; `send()`
 * throws a real, clear, loud error only if actually invoked with none
 * configured, never a silent no-op.
 */
@Injectable()
export class PushClientService {
  private readonly app: App | null;

  constructor(@Inject(PUSH_CONFIG) config: PushEnv) {
    this.app =
      config.FCM_PROJECT_ID && config.FCM_CLIENT_EMAIL && config.FCM_PRIVATE_KEY
        ? initializeApp(
            {
              credential: cert({
                projectId: config.FCM_PROJECT_ID,
                clientEmail: config.FCM_CLIENT_EMAIL,
                privateKey: config.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
              }),
            },
            'notification-service-push',
          )
        : null;
  }

  async send(params: SendPushParams): Promise<void> {
    if (!this.app) {
      throw new Error(
        'FCM is not configured (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY missing) — push send unavailable in this environment',
      );
    }
    await getMessaging(this.app).send({
      token: params.token,
      notification: { title: params.title, body: params.body },
    });
  }
}
