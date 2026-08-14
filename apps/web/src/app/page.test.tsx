import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';

import LandingPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

function renderLandingPage() {
  return render(
    <ThemeProvider>
      <LandingPage />
    </ThemeProvider>,
  );
}

describe('LandingPage', () => {
  it('renders the hero headline and primary calls to action', () => {
    renderLandingPage();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your personal AI teacher for every language.',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start learning free' }).length).toBeGreaterThan(0);
  });

  it('renders both pricing tiers with their own upgrade call to action', () => {
    renderLandingPage();

    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade to Premium' })).toBeInTheDocument();
  });

  it('renders the site header with a working login link, proving the token pipeline is live', () => {
    renderLandingPage();

    const loginLinks = screen.getAllByRole('link', { name: 'Log in' });
    const headerLoginLink = loginLinks.find((link) => link.className.includes('bg-surface-muted'));
    expect(headerLoginLink).toHaveAttribute('href', '/login');
  });
});
