import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';

import LandingPage from './page';

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

  it('renders a real AI-chat product mockup in the hero, not just an icon card', () => {
    renderLandingPage();

    expect(screen.getAllByText('Aria').length).toBeGreaterThan(0);
    expect(screen.getByText('AI Language Tutor')).toBeInTheDocument();
    expect(screen.getByText('Quisiera un café, por favor.')).toBeInTheDocument();
    expect(screen.getByText('I went')).toBeInTheDocument();
  });

  it('renders the four learning journeys as a numbered, ordered sequence', () => {
    const { container } = renderLandingPage();

    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
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
