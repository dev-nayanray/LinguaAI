'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, useSessionStore } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';

import { FormError, FormField, FormSuccess, TextInput } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

/**
 * `POST /v1/auth/login` (Part 6). apps/web's userbase (USER/TEACHER) never
 * hits ADR-011's MFA step-up gate (ADMIN/ENTERPRISE_ADMIN only) — the
 * `MFA_REQUIRED` branch below is handled defensively (a clear message, not
 * a crash) rather than a full second-step UI, since it's not a reachable
 * path for this app's real users; `apps/admin`'s login page is where that
 * flow actually lives.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useSessionStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.login({ email, password });
      if (result.status === 'MFA_REQUIRED') {
        setError('This account requires MFA step-up, which is not supported from this app.');
        return;
      }
      setSession(result.accessToken, result.user);
      router.push('/profile');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Log in</h1>

        {searchParams.get('registered') === '1' && (
          <FormSuccess message="Account created — log in to continue." />
        )}

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

          <FormField label="Password" htmlFor="password">
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          <FormError message={error} />

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Log in
          </Button>
        </form>

        <p className="flex justify-between text-sm text-neutral-500">
          <a href="/register" className="text-primary hover:underline">
            Create account
          </a>
          <a href="/password-reset" className="text-primary hover:underline">
            Forgot password?
          </a>
        </p>
      </div>
    </main>
  );
}
