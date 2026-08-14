import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from './theme-provider';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('SiteHeader', () => {
  it('renders the brand, nav items, and both auth calls to action', () => {
    render(
      <ThemeProvider>
        <SiteHeader />
      </ThemeProvider>,
    );

    expect(screen.getByRole('link', { name: 'LinguaAI' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register');
  });
});
