import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ThemeProvider } from './theme-provider';
import { SiteHeader } from './site-header';

function renderHeader() {
  return render(
    <ThemeProvider>
      <SiteHeader />
    </ThemeProvider>,
  );
}

describe('SiteHeader', () => {
  it('renders the brand, nav items, and both auth calls to action', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'LinguaAI' })).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link', { name: 'How it works' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Log in' })[0]).toHaveAttribute('href', '/login');
    expect(screen.getAllByRole('link', { name: 'Get started' })[0]).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('the mobile menu toggle opens a real nav panel (a second set of links), not a CSS-only overflow', async () => {
    const user = userEvent.setup();
    renderHeader();

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Only the always-present desktop nav's own "Pricing" link exists while closed.
    expect(screen.getAllByRole('link', { name: 'Pricing' })).toHaveLength(1);

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // The mobile panel's own "Pricing" link now exists alongside the desktop one.
    const pricingLinks = screen.getAllByRole('link', { name: 'Pricing' });
    expect(pricingLinks).toHaveLength(2);

    await user.click(pricingLinks[1]!);

    expect(screen.getAllByRole('link', { name: 'Pricing' })).toHaveLength(1);
  });
});
