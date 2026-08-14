'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSessionStore } from '@linguaai/auth-client';
import { Button } from '@linguaai/ui';
import { BottomTabBar, Sidebar, type NavItem } from '@linguaai/ui/navigation';
import { BookMarked, BookOpen, LayoutDashboard, User } from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';
import { authClient } from '@/lib/auth-client';

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
  },
  { href: '/courses', label: 'Courses', icon: <BookOpen className="h-4 w-4" aria-hidden="true" /> },
  {
    href: '/vocabulary',
    label: 'Vocabulary',
    icon: <BookMarked className="h-4 w-4" aria-hidden="true" />,
  },
  { href: '/profile', label: 'Profile', icon: <User className="h-4 w-4" aria-hidden="true" /> },
];

/**
 * The one real layout-level auth guard for the app's authenticated area —
 * the same "check the store, fall back to `bootstrapSession` from the
 * httpOnly refresh cookie, redirect on failure" pattern `/profile` and
 * `apps/admin`'s `/dashboard` each already hand-roll independently,
 * centralized here so every page placed under `(app)/` gets it for free.
 * `/profile` itself is deliberately left outside this group, unmodified —
 * see docs/WEB_DESIGN.md §3.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  const clear = useSessionStore((s) => s.clear);
  const [loading, setLoading] = useState(true);

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
    // Deliberately mount-once — see apps/web's own /profile page for why
    // useRouter()'s return value can't be trusted as a stable dependency.
  }, []);

  async function onLogout() {
    try {
      await authClient.logout();
    } finally {
      clear();
      router.replace('/login');
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <p className="type-body-sm text-neutral-text">Loading your account…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={NAV_ITEMS}
        activeHref={pathname ?? '/dashboard'}
        className="hidden tablet:flex"
        header={<span className="type-heading-md text-text">LinguaAI</span>}
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="truncate type-body-sm text-neutral-text">{user.displayName}</span>
            <ThemeToggle />
          </div>
        }
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <span className="type-heading-md text-text tablet:hidden">LinguaAI</span>
          <span className="hidden truncate type-body-sm text-neutral-text tablet:block">
            {user.email}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle className="tablet:hidden" />
            <Button variant="secondary" onClick={() => void onLogout()}>
              Log out
            </Button>
          </div>
        </header>

        <main className="flex-1 pb-20 tablet:pb-0">{children}</main>

        <BottomTabBar
          items={NAV_ITEMS}
          activeHref={pathname ?? '/dashboard'}
          className="tablet:hidden"
        />
      </div>
    </div>
  );
}
