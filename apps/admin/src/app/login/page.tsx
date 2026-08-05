'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, useSessionStore } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';

import { FormError, FormField, TextInput } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

type Step = { kind: 'password' } | { kind: 'mfa'; challengeToken: string };

/**
 * ADR-011: every `ADMIN`/`ENTERPRISE_ADMIN` login unconditionally routes
 * through MFA step-up when the account is MFA-enrolled — `AuthService.loginResponse`
 * (E2-T22) is the backend half of this; this page is the two-step UI over
 * it. An MFA-enrolled admin never reaches a full session from the password
 * step alone (`status: 'MFA_REQUIRED'`, no cookie set yet); a
 * not-yet-enrolled admin (or, in principle, any other role) still gets
 * `'AUTHENTICATED'` directly from the same endpoint — this page handles
 * both outcomes from the one form, rather than assuming step-up always
 * applies.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const setSession = useSessionStore((s) => s.setSession);
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.login({ email, password });
      if (result.status === 'MFA_REQUIRED') {
        setStep({ kind: 'mfa', challengeToken: result.challengeToken });
        return;
      }
      setSession(result.accessToken, result.user);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== 'mfa') {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.mfaChallenge({ challengeToken: step.challengeToken, code });
      // completeMfaChallenge (auth.service.ts) only ever returns the
      // AUTHENTICATED shape on success — MFA_REQUIRED can't recur here.
      if (result.status === 'AUTHENTICATED') {
        setSession(result.accessToken, result.user);
        router.push('/dashboard');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Invalid or expired code. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">LinguaAI Admin</h1>

        {step.kind === 'password' ? (
          <form onSubmit={onPasswordSubmit} className="space-y-4" noValidate>
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
              Continue
            </Button>
          </form>
        ) : (
          <form onSubmit={onCodeSubmit} className="space-y-4" noValidate>
            <p className="text-sm text-neutral-500">
              Enter the 6-digit code from your authenticator app.
            </p>

            <FormField label="6-digit code" htmlFor="code">
              <TextInput
                id="code"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </FormField>

            <FormError message={error} />

            <Button type="submit" variant="primary" className="w-full" loading={submitting}>
              Verify
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
