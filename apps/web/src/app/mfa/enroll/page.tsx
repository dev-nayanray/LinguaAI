'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, useSessionStore } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';
import { FormField, Input } from '@linguaai/ui/forms';

import { FormError } from '@/components/auth-form';
import { authClient } from '@/lib/auth-client';

/**
 * `POST /v1/auth/mfa/enroll` + `POST /v1/auth/mfa/verify` (Part 6, E2-T13).
 * Two-step, matching the backend's own split: `enroll` returns a pending
 * secret (written nowhere yet), `verify` proves the caller can compute a
 * valid code for it before `complete_mfa_enrollment()` ever persists it.
 * No QR code — no QR library exists anywhere in this codebase yet, and
 * adding one is out of this task's scope (Part 12: no new dependencies
 * beyond what's needed); the manual-entry secret is the fallback every
 * real authenticator app already supports.
 */
export default function MfaEnrollPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ensureSession() {
      if (!useSessionStore.getState().user) {
        const bootstrapped = await authClient.bootstrapSession();
        if (!bootstrapped) {
          router.replace('/login');
          return;
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }
    void ensureSession();
    return () => {
      cancelled = true;
    };
    // Deliberately mount-once ([]), not [router] — see apps/admin's
    // dashboard/page.tsx for why `useRouter()`'s return value can't be
    // trusted as a stable effect dependency here.
  }, []);

  async function beginEnrollment() {
    setError(null);
    try {
      const result = await authClient.mfaEnroll();
      setPending(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await authClient.mfaVerify({ secret: pending.secret, code });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-neutral-text">Loading…</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-success-text">MFA enrollment complete.</p>
        <a href="/profile" className="text-sm text-primary hover:underline">
          Back to profile
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Enroll in MFA</h1>

        {!pending ? (
          <Button variant="primary" className="w-full" onClick={() => void beginEnrollment()}>
            Begin enrollment
          </Button>
        ) : (
          <form onSubmit={onVerify} className="space-y-4" noValidate>
            <div className="space-y-1 text-sm">
              <p className="text-neutral-text">
                Add this secret to your authenticator app, then enter the 6-digit code it generates.
              </p>
              <code className="block break-all rounded-md bg-surface-muted p-2 text-xs">
                {pending.secret}
              </code>
            </div>

            <FormField label="6-digit code">
              <Input
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </FormField>

            <FormError message={error} />

            <Button type="submit" variant="primary" className="w-full" loading={submitting}>
              Confirm
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
