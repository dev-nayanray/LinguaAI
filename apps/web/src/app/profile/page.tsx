'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';

import { authClient } from '@/lib/auth-client';

/**
 * `GET /v1/users/me` (Part 6). The access token lives only in memory
 * (Part 12), so a fresh page load — including the very first render after
 * `/login`'s own `router.push`, since that's still a full client-side
 * navigation that keeps the in-memory Zustand store, but a hard reload of
 * *this* page would not — always re-derives "am I logged in" from the
 * httpOnly refresh cookie via `bootstrapSession`, never assumes the store
 * is already populated.
 */
export default function ProfilePage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const clear = useSessionStore((s) => s.clear);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      if (useSessionStore.getState().user) {
        setLoading(false);
        return;
      }
      const bootstrapped = await authClient.bootstrapSession();
      if (cancelled) {
        return;
      }
      if (!bootstrapped) {
        router.replace('/login');
        return;
      }
      setLoading(false);
    }

    void ensureSession();
    return () => {
      cancelled = true;
    };
    // Deliberately mount-once ([]), not [router] — see apps/admin's
    // dashboard/page.tsx for why `useRouter()`'s return value can't be
    // trusted as a stable effect dependency here.
  }, []);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await authClient.logout();
    } finally {
      clear();
      router.replace('/login');
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-neutral-text">Loading your profile…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Your profile</h1>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-text">Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-text">Display name</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-text">Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-text">MFA enrolled</dt>
            <dd>{user.mfaEnrolled ? 'Yes' : 'No'}</dd>
          </div>
        </dl>

        {!user.mfaEnrolled && (
          <a href="/mfa/enroll" className="block text-sm text-primary hover:underline">
            Enroll in MFA
          </a>
        )}

        <a href="/billing" className="block text-sm text-primary hover:underline">
          Billing & subscription
        </a>

        <Button
          variant="secondary"
          className="w-full"
          loading={loggingOut}
          onClick={() => void onLogout()}
        >
          Log out
        </Button>
      </div>
    </main>
  );
}
