import { describe, expect, it } from 'vitest';

import {
  notificationPreferenceChangedPayloadSchema,
  notificationPreferenceSchema,
  notificationPreferencesResponseSchema,
  updateNotificationPreferenceRequestSchema,
} from './index.js';

const uuid = '9c858f1b-45c0-4b8e-9c1e-2f6a9c9b6d21';

describe('notificationPreferenceSchema', () => {
  it('accepts a real preference row', () => {
    expect(() =>
      notificationPreferenceSchema.parse({ channel: 'EMAIL', type: 'SYSTEM', optedIn: true }),
    ).not.toThrow();
  });

  it('rejects an unknown channel/type', () => {
    expect(() =>
      notificationPreferenceSchema.parse({ channel: 'SMS', type: 'SYSTEM', optedIn: true }),
    ).toThrow();
    expect(() =>
      notificationPreferenceSchema.parse({ channel: 'EMAIL', type: 'UNKNOWN', optedIn: true }),
    ).toThrow();
  });
});

describe('notificationPreferencesResponseSchema', () => {
  it('accepts a real array of preference rows', () => {
    expect(() =>
      notificationPreferencesResponseSchema.parse([
        { channel: 'EMAIL', type: 'SYSTEM', optedIn: true },
        { channel: 'EMAIL', type: 'MARKETING', optedIn: false },
      ]),
    ).not.toThrow();
  });
});

describe('updateNotificationPreferenceRequestSchema', () => {
  it('accepts a real PUT request body, SECURITY_ALERT included (schema-valid; the controller rejects it at the business-rule layer)', () => {
    expect(() =>
      updateNotificationPreferenceRequestSchema.parse({
        channel: 'EMAIL',
        type: 'SECURITY_ALERT',
        optedIn: false,
      }),
    ).not.toThrow();
  });
});

describe('notificationPreferenceChangedPayloadSchema', () => {
  it('accepts a real event payload', () => {
    expect(() =>
      notificationPreferenceChangedPayloadSchema.parse({
        userId: uuid,
        channel: 'EMAIL',
        type: 'MARKETING',
        enabled: false,
      }),
    ).not.toThrow();
  });
});
