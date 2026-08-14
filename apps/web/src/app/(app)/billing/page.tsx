'use client';

import { useState } from 'react';
import { Check, Crown } from 'lucide-react';
import { Button } from '@linguaai/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@linguaai/ui/cards';

import { useBillingStatus, useCreateCheckoutSession } from '@/lib/api/billing';

const PREMIUM_FEATURES = [
  'Unlimited speaking practice',
  'Pronunciation lab',
  'Exam preparation & mock tests',
  'Writing assistant & AI stories',
];

export default function BillingPage() {
  const status = useBillingStatus();
  const checkout = useCreateCheckoutSession();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  function onUpgrade() {
    setCheckoutError(null);
    checkout.mutate(undefined, {
      onSuccess: (result) => {
        window.location.href = result.checkoutUrl;
      },
      onError: () => setCheckoutError('Could not start checkout. Please try again.'),
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">Billing</h1>
      <p className="mt-1 type-body-sm text-neutral-text">Your plan, subscription, and upgrade.</p>

      {status.isLoading && (
        <div className="mt-6 h-32 w-full animate-pulse rounded-lg bg-surface-muted" />
      )}

      {status.isError && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">Could not load your billing status.</p>
            <button
              type="button"
              onClick={() => void status.refetch()}
              className="type-body-sm font-semibold text-primary-text hover:underline"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {status.data && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              {status.data.planTier !== 'FREE' && (
                <Crown className="h-5 w-5 text-warning-text" aria-hidden="true" />
              )}
              <CardTitle>{status.data.planTier} plan</CardTitle>
            </div>
            {status.data.subscriptionStatus && (
              <CardDescription>Status: {status.data.subscriptionStatus}</CardDescription>
            )}
          </CardHeader>
          {status.data.currentPeriodEnd && (
            <CardContent>
              <p className="type-body-sm text-neutral-text">
                Current period ends {new Date(status.data.currentPeriodEnd).toLocaleDateString()}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {status.data?.planTier === 'FREE' && (
        <Card className="mt-6 border-primary-text">
          <CardHeader>
            <CardTitle>Upgrade to Premium</CardTitle>
            <CardDescription>Unlock the full learning experience.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="space-y-2 type-body-sm text-neutral-text">
              {PREMIUM_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button variant="primary" loading={checkout.isPending} onClick={onUpgrade}>
              Upgrade to Premium
            </Button>
            {checkoutError && <p className="type-body-sm text-danger-text">{checkoutError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
