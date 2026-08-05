'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';

import { authClient } from '@/lib/auth-client';

/**
 * Minimal post-login landing page — proves the full ADR-011 loop
 * (password → MFA challenge → real session → protected page) actually
 * works end to end. Same "re-derive from the httpOnly cookie on every
 * fresh load" discipline as apps/web's `/profile` (Part 12: access token
 * in memory only).
 */
export default function AdminDashboardPage() {
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
    // Deliberately mount-once ([]), not [router] — `useRouter()`'s return
    // value isn't guaranteed referentially stable across renders (a real,
    // observable issue: a test mock returning a fresh object per call made
    // this effect re-fire on every `setLoading` update, double-invoking
    // `bootstrapSession`). This effect's own intent is "run once, on
    // mount," not "re-run whenever the router identity changes."
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
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-sm text-neutral-500">
          Signed in as {user.email} ({user.role})
        </p>
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
