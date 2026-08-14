'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@linguaai/ui';
import { TopNav, type NavItem } from '@linguaai/ui/navigation';

import { ThemeToggle } from './theme-toggle';

const NAV_ITEMS: NavItem[] = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <TopNav
      items={NAV_ITEMS}
      activeHref={pathname ?? '/'}
      brand={
        <a href="/" className="type-heading-md text-text">
          LinguaAI
        </a>
      }
      actions={
        <>
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <a href="/login">Log in</a>
          </Button>
          <Button variant="primary" asChild>
            <a href="/register">Get started</a>
          </Button>
        </>
      }
    />
  );
}
