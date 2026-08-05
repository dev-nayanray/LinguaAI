'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';

import { FormError, FormField, TextInput } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

/** `POST /v1/auth/register` (Part 6) — `locale`/`timezone` are captured from the browser rather than asked, matching CODING_STANDARDS.md's "don't ask the user for what the platform already knows" default. */
export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!agreed) {
      setError('You must accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setSubmitting(true);
    try {
      await authClient.register({
        email,
        password,
        displayName,
        locale: navigator.language || 'en-US',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        tosAccepted: true,
        privacyPolicyAccepted: true,
        marketingConsent,
      });
      router.push('/login?registered=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Create your account</h1>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="email">
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField label="Display name" htmlFor="displayName">
            <TextInput
              id="displayName"
              name="displayName"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </FormField>

          <FormField label="Password" htmlFor="password">
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          <label className="flex items-start gap-2 text-sm text-text dark:text-neutral-50">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            I agree to the Terms of Service and Privacy Policy
          </label>

          <label className="flex items-start gap-2 text-sm text-text dark:text-neutral-50">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            Send me product updates (optional)
          </label>

          <FormError message={error} />

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Create account
          </Button>
        </form>

        <p className="text-sm text-neutral-500">
          Already have an account?{' '}
          <a href="/login" className="text-primary hover:underline">
            Log in
          </a>
        </p>
      </div>
    </main>
  );
}
