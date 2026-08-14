'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@linguaai/ui';

import { ThemeToggle } from './theme-toggle';

const NAV_ITEMS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
];

/**
 * Hand-built rather than `@linguaai/ui/navigation`'s `TopNav`: `TopNav` is
 * a rigid single-row layout with no responsive collapse of its own
 * (presentational-only, no opinion on breakpoints beyond what the caller
 * passes in `className`) — fine for 2-3 items, but this header needs nav
 * links *and* two CTA buttons *and* a theme toggle inside a fixed `h-16`
 * bar, which genuinely overflows on a narrow viewport with no way to wrap.
 * A real mobile disclosure (this component's own `<button aria-expanded>`
 * + panel) replaces that overflow instead of hiding the bug.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="/" className="type-heading-md text-text">
          LinguaAI
        </a>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 tablet:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 type-body-sm text-neutral-text transition-colors duration-micro hover:text-text"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 tablet:flex">
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <a href="/login">Log in</a>
          </Button>
          <Button variant="primary" asChild>
            <a href="/register">Get started</a>
          </Button>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-md text-text tablet:hidden"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-border bg-surface px-4 py-4 tablet:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 type-body-sm text-neutral-text transition-colors duration-micro hover:bg-surface-muted hover:text-text"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-4">
            <ThemeToggle />
            <div className="flex flex-1 justify-end gap-2">
              <Button variant="ghost" asChild>
                <a href="/login">Log in</a>
              </Button>
              <Button variant="primary" asChild>
                <a href="/register">Get started</a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
