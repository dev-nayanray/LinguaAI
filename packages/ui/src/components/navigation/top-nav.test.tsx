import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TopNav } from './top-nav';

const items = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/profile', label: 'Profile' },
];

describe('TopNav', () => {
  it('renders every item as a link with the correct href', () => {
    render(<TopNav items={items} activeHref="/lessons" />);
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });

  it('marks only the active item with aria-current="page"', () => {
    render(<TopNav items={items} activeHref="/lessons" />);
    expect(screen.getByRole('link', { name: 'Lessons' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current');
  });

  it('renders optional brand and actions slots', () => {
    render(
      <TopNav
        items={items}
        activeHref="/lessons"
        brand={<span>LinguaAI</span>}
        actions={<button>Log out</button>}
      />,
    );
    expect(screen.getByText('LinguaAI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('exposes a "Main" navigation landmark', () => {
    render(<TopNav items={items} activeHref="/lessons" />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
