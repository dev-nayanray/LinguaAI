'use client';

import { Fragment } from 'react';
import { Switch } from '@linguaai/ui/forms';
import { Card, CardContent } from '@linguaai/ui/cards';
import type { NotificationChannel, NotificationType } from '@linguaai/validation/notification';

import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from '@/lib/api/notification-preferences';

const CHANNELS: NotificationChannel[] = ['EMAIL', 'PUSH'];

const TYPE_LABELS: Record<NotificationType, string> = {
  STREAK_REMINDER: 'Streak reminders',
  MILESTONE: 'Milestones & achievements',
  BILLING_RECEIPT: 'Billing receipts',
  SECURITY_ALERT: 'Security alerts',
  MARKETING: 'Product news & tips',
  SYSTEM: 'System notifications',
};

const TYPE_ORDER: NotificationType[] = [
  'STREAK_REMINDER',
  'MILESTONE',
  'BILLING_RECEIPT',
  'SECURITY_ALERT',
  'MARKETING',
  'SYSTEM',
];

export default function NotificationSettingsPage() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreference();

  function isOptedIn(type: NotificationType, channel: NotificationChannel): boolean {
    return preferences.data?.find((p) => p.type === type && p.channel === channel)?.optedIn ?? true;
  }

  function onToggle(type: NotificationType, channel: NotificationChannel, next: boolean) {
    update.mutate({ type, channel, optedIn: next });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">Notification settings</h1>
      <p className="mt-1 type-body-sm text-neutral-text">
        Choose which notifications you receive, by channel.
      </p>

      {preferences.isLoading && (
        <div className="mt-6 h-64 w-full animate-pulse rounded-lg bg-surface-muted" />
      )}

      {preferences.isError && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">Could not load your preferences.</p>
            <button
              type="button"
              onClick={() => void preferences.refetch()}
              className="type-body-sm font-semibold text-primary-text hover:underline"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {!preferences.isLoading && !preferences.isError && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-[1fr,auto,auto] items-center gap-x-6 gap-y-4">
              <span />
              {CHANNELS.map((channel) => (
                <span
                  key={channel}
                  className="justify-self-center type-body-sm font-semibold text-text"
                >
                  {channel === 'EMAIL' ? 'Email' : 'Push'}
                </span>
              ))}

              {TYPE_ORDER.map((type) => {
                const isSecurityAlert = type === 'SECURITY_ALERT';
                return (
                  <Fragment key={type}>
                    <span className="type-body-sm text-text">
                      {TYPE_LABELS[type]}
                      {isSecurityAlert && (
                        <span className="block type-caption text-neutral-text">
                          Can't be turned off
                        </span>
                      )}
                    </span>
                    {CHANNELS.map((channel) => (
                      <span key={`${type}-${channel}`} className="justify-self-center">
                        <Switch
                          checked={isSecurityAlert ? true : isOptedIn(type, channel)}
                          disabled={isSecurityAlert || update.isPending}
                          onCheckedChange={(checked) => onToggle(type, channel, checked)}
                          aria-label={`${TYPE_LABELS[type]} via ${channel === 'EMAIL' ? 'email' : 'push'}`}
                        />
                      </span>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
