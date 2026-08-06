'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';
import { FormField, Input } from '@linguaai/ui/forms';

import { FormError, FormSuccess } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

/**
 * `POST /v1/auth/password-reset/request` (Part 6, E2-T19). The response is
 * deliberately identical (`EMAIL_SENT`) whether the email belongs to a real
 * account or not — `passwordResetRequestResponseSchema`'s own doc comment
 * explains why (enumeration resistance) — so this UI shows the same
 * "check your email" message either way, never a "no such account" error.
 * `OAUTH_ACCOUNT` is the one deliberate, narrower exception.
 */
export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({ email });
      if (result.status === 'OAUTH_ACCOUNT') {
        setSuccess(`This account signs in via ${result.providers.join(', ')} — use that instead.`);
      } else {
        setSuccess('If an account exists for that email, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Reset your password</h1>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormError message={error} />
          <FormSuccess message={success} />

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Send reset link
          </Button>
        </form>

        <p className="text-sm text-neutral-text">
          <a href="/login" className="text-primary hover:underline">
            Back to log in
          </a>
        </p>
      </div>
    </main>
  );
}
