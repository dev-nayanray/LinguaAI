'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';

import { FormError, FormField, TextInput } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

/** `POST /v1/auth/password-reset/confirm` (Part 6) — `token` arrives as a query param from the emailed reset link (not built here — no email delivery exists yet, T19's flagged gap). */
export default function PasswordResetConfirmPage() {
  return (
    <Suspense>
      <PasswordResetConfirmForm />
    </Suspense>
  );
}

function PasswordResetConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authClient.confirmPasswordReset({ token, newPassword });
      router.push('/login?reset=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <FormError message="This link is missing its reset token. Request a new one from the reset-password page." />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="New password" htmlFor="newPassword">
            <TextInput
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>

          <FormField label="Confirm new password" htmlFor="confirmPassword">
            <TextInput
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>

          <FormError message={error} />

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Reset password
          </Button>
        </form>
      </div>
    </main>
  );
}
